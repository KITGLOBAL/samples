import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth'
import appleAuth from '@invertase/react-native-apple-authentication'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { AccessToken, LoginManager } from 'react-native-fbsdk-next'
import firestore from '@react-native-firebase/firestore'
import messaging from '@react-native-firebase/messaging'
import { getBuildNumber, getVersion } from 'react-native-device-info'
import * as Sentry from '@sentry/react-native'
import dynamicLinks from '@react-native-firebase/dynamic-links'
import { AUTH_PROVIDERS_CONFIG } from '@app/consts'

import { EAuthTypes, Link } from './types'
import { navigationRef } from '@app/navigation/ref'
import { Platform } from 'react-native'
import { addToastAction, setBannedAction, getUserAction } from '@app/store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { firebaseErrors } from '@app/utils'
import { store } from '@app/store'
import { t } from 'i18next'
import { getUserAPI } from '@app/store/user/api'
import { TUser } from '@app/store/user/types'
import { AxiosResponse } from 'axios'

class Firebase {
  private auth
  private firestore
  private messaging
  private confirmation: FirebaseAuthTypes.ConfirmationResult | undefined
  private snapshot: FirebaseAuthTypes.PhoneAuthSnapshot | undefined
  private unsubscribeInstance:
    | ReturnType<typeof this.auth.onAuthStateChanged>
    | undefined

  constructor() {
    this.auth = auth()
    this.firestore = firestore()
    this.messaging = messaging()
  }

  // Auth state changed
  public subscribe(cb: (user: FirebaseAuthTypes.User | null) => void) {
    this.unsubscribeInstance = this.auth.onAuthStateChanged(cb)

    GoogleSignin.configure({
      webClientId: AUTH_PROVIDERS_CONFIG.google?.webClientId,
      scopes: ['https://www.googleapis.com/auth/userinfo.profile', 'openid'],
    })

    dynamicLinks().onLink(this.handleDynamicLink.bind(this))
    dynamicLinks()
      .getInitialLink()
      .then(link => link && this.handleDynamicLink.call(this, link))

    return this.unsubscribeInstance
  }

  public unsubscribe() {
    this.unsubscribeInstance && this.unsubscribeInstance()
  }

  public async signInWithEmail(email: string) {
    await AsyncStorage.setItem('EMAIL_FOR_SIGN_IN', email)

    await this.auth.sendSignInLinkToEmail(
      email,
      AUTH_PROVIDERS_CONFIG.email?.actionCodeSettings,
    )
  }

  // Google login
  public async signInWithGoogle() {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })

      const { idToken } = await GoogleSignin.signIn()

      const googleCredential = auth.GoogleAuthProvider.credential(idToken)

      const signInResult = await this.auth.signInWithCredential(
        googleCredential,
      )

      await this.updateProfile(signInResult)

      await this.firestoreUpdate(EAuthTypes.GOOGLE)
    } catch (error) {
      this.validateError(error)
    }
  }

  // Facebook login
  public async signInWithFacebook() {
    try {
      LoginManager.setLoginBehavior('web_only')
      const result = await LoginManager.logInWithPermissions([
        'public_profile',
        'email',
      ])
      if (result?.isCancelled) {
        throw new Error('User cancelled the login process')
      }
      const data = await AccessToken.getCurrentAccessToken()
      if (!data) {
        throw new Error('Something went wrong obtaining access token')
      }
      const facebookCredential = auth.FacebookAuthProvider.credential(
        data.accessToken,
      )
      const signInResult = await this.auth.signInWithCredential(
        facebookCredential,
      )

      await this.updateProfile(signInResult)

      await this.firestoreUpdate(EAuthTypes.FACEBOOK)
    } catch (error) {
      this.validateError(error)
    }
  }

  // Sign in with apple
  public async signInWithApple() {
    try {
      const appleAuthRequestResponse = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      })

      if (!appleAuthRequestResponse.identityToken) {
        throw new Error('Apple Sign-In failed - no identify token returned')
      }

      const { identityToken, nonce } = appleAuthRequestResponse
      const appleCredential = auth.AppleAuthProvider.credential(
        identityToken,
        nonce,
      )

      const signInResult = await this.auth.signInWithCredential(appleCredential)

      await this.updateProfile(signInResult)

      await this.firestoreUpdate(EAuthTypes.APPLE)
    } catch (error) {
      this.validateError(error)
    }
  }

  // sign in with phone
  public async signInWithPhone(
    phoneNumber: string,
    resend: boolean | undefined = false,
  ) {
    const codeConfirm = await this.auth.signInWithPhoneNumber(
      phoneNumber,
      resend,
    )
    this.confirmation = codeConfirm
  }

  //  confirm verirfication code
  public async confirmCode(code: string) {
    if (!this.confirmation) throw Error('Nothing to confirm')
    await this.confirmation?.confirm(code)
    await this.firestoreUpdate(EAuthTypes.PHONE)
  }

  // Verify phone number
  public async verifyPhoneNumber(
    phone: string,
    resend: boolean | undefined = false,
    callbackSuccess?: (
      verificationId: FirebaseAuthTypes.PhoneAuthSnapshot,
    ) => void,
    callbackFailure?: (
      verificationId: FirebaseAuthTypes.PhoneAuthSnapshot,
    ) => void,
  ) {
    return this.auth
      .verifyPhoneNumber(phone, resend)
      .on('state_changed', snapshot => {
        if (snapshot?.state === 'sent') {
          this.snapshot = snapshot
          callbackSuccess?.(snapshot)
        } else {
          callbackFailure?.(snapshot)
        }
      })
      .catch(err => {
        this.validateError(err)
      })
  }

  // Link phone number
  public async linkPhoneNumber(code: string) {
    if (!this.snapshot) throw Error('Nothing to confirm')

    const credential = auth.PhoneAuthProvider.credential(
      this.snapshot.verificationId,
      code,
    )

    return this.auth.currentUser?.updatePhoneNumber(credential)
  }

  // Unlink phone number
  public async unlinkUserPhone() {
    return this.auth.currentUser?.unlink(auth.PhoneAuthProvider.PROVIDER_ID)
  }

  // Get current user
  public getUser() {
    const user = this.auth?.currentUser
    return user
  }

  public async getMessagingToken() {
    return this.messaging.getToken()
  }

  public async getFirestoreUserByPhoneNumber(phoneNumber: string) {
    return this.firestore
      .collection('users')
      .where('phone', '==', phoneNumber)
      .get()
  }

  // Sign out user
  public async signOut() {
    await this.auth?.signOut?.()
  }

  public async handleDynamicLink(link: Link) {
    if (this.auth.isSignInWithEmailLink(link.url)) {
      try {
        const email = await AsyncStorage.getItem('EMAIL_FOR_SIGN_IN')

        await this.auth.signInWithEmailLink(email!, link.url)

        await this.firestoreUpdate(EAuthTypes.EMAIL)
      } catch (error) {
        this.validateError(error)

        Sentry.captureException(error)
      }
    }
  }

  public async updateProfile(result: void | FirebaseAuthTypes.UserCredential) {
    const profile = result?.additionalUserInfo?.profile

    await this.auth.currentUser?.updateProfile({
      displayName:
        (profile?.family_name || profile?.last_name || '') +
        ' ' +
        (profile?.given_name || profile?.first_name || ''),
      photoURL: profile?.picture,
    })
  }

  public async validateError(error: unknown) {
    const err = error as { code?: string; message?: string }
    if (err.code === firebaseErrors['auth/user-disabled']) {
      store.dispatch(setBannedAction(true))
      return
    }

    if (err.code) {
      Sentry.captureException(error)
      const existError = firebaseErrors[err.code]

      existError &&
        store.dispatch(
          addToastAction.request({
            type: 'error',
            text: t(err.code) ?? '',
          }),
        )
    }
  }

  public async getDbUser(uid?: string): Promise<null | TUser> {
    if (!uid) {
      return null
    }

    try {
      const user: AxiosResponse<TUser> = await getUserAPI(uid)
      return user?.data ?? null
    } catch {
      return null
    }
  }

  public async firestoreUpdate(regType: EAuthTypes) {
    try {
      const FCMToken: string = await messaging().getToken()

      const user = await this.firestore
        .collection('users')
        .doc(this.auth.currentUser?.uid)
        .get()

      const dbUser = await this.getDbUser(this.auth.currentUser?.uid)

      if (!user.exists || !dbUser) {
        await this.firestore
          .collection('users')
          .doc(this.auth.currentUser?.uid)
          .set({
            authStage: 'REGISTRATION',
            regType: regType,
            name: this.auth.currentUser?.displayName,
            phone: this.auth.currentUser?.phoneNumber,
            email: this.auth.currentUser?.email,
            photo: null,
            reg_token: FCMToken,
            appVersion: `${
              Platform.OS === 'ios' ? 'IOS' : 'Android'
            }-${getVersion()}.${getBuildNumber()}`,
            birthDate: null,
            location: null,
            gender: null,
          })

        navigationRef.current?.navigate('FillInfo', { authType: regType })
      } else if (user.exists) {
        const id: string | undefined = auth().currentUser?.uid

        if (id) {
          await this.firestore
            .collection('users')
            .doc(this.auth.currentUser?.uid)
            .update({
              reg_token: FCMToken,
              regType: regType,
              appVersion: `${
                Platform.OS === 'ios' ? 'IOS' : 'Android'
              }-${getVersion()}.${getBuildNumber()}`,
            })
          store.dispatch(getUserAction.request())
        }
      }
    } catch (error) {
      this.validateError(error)
      Sentry.captureException(error)
    }
  }
}

export default new Firebase()
