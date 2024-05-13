import { useTranslation } from 'next-i18next'
import Image from 'next/image'
import { FC } from 'react'
import {
  assets,
  Button,
  Checkbox,
  FlexContainer,
  Input,
  UnderlineLink,
} from '../../common'
import {
  AgreementText,
  AuthButton,
  AuthLabel,
  Background,
  Container,
  CrossContainer,
  Hr,
  Label,
  Popup,
  PopupWrapper,
} from './styled'

type TAuthPopup = {
  closePopupHandler?: () => void
}

const AuthPopup: FC<TAuthPopup> = ({ closePopupHandler }) => {
  const { t } = useTranslation(['common'])

  return (
    <Container>
      <Background onClick={closePopupHandler} />
      <Popup>
        <PopupWrapper>
          <Label>{t('auth')}</Label>

          <FlexContainer style={{ marginTop: '30px' }}>
            <Input
              label={t('phone')}
              error={t('phone.is.incorrect')}
              isValid={false}
            />
          </FlexContainer>

          <FlexContainer style={{ marginTop: '20px' }}>
            <Button>{t('enter')}</Button>
          </FlexContainer>

          <FlexContainer style={{ marginTop: '30px' }} gap={14} width="100%">
            <Hr />
            <AuthLabel>{t('auth.with.account')}</AuthLabel>
            <Hr />
          </FlexContainer>

          <FlexContainer style={{ marginTop: '13px' }} gap={21}>
            <AuthButton>
              <Image src={assets.google} />
            </AuthButton>
            <AuthButton>
              <Image src={assets.facebook} />
            </AuthButton>
            <AuthButton>
              <Image src={assets.apple} />
            </AuthButton>
          </FlexContainer>
          <FlexContainer
            justify="flex-start"
            align="flex-start"
            gap={12}
            style={{ marginTop: '30px' }}
          >
            <Checkbox checked size="20px" />
            <AgreementText>
              {`${t('i.accept.terms')} `}
              <UnderlineLink>{t('agreement.of.privacy.policy')}</UnderlineLink>
              {` ${t('and')} `}
              <UnderlineLink>{t('user.agreement')}</UnderlineLink>.
            </AgreementText>
          </FlexContainer>

          <CrossContainer onClick={closePopupHandler}>
            <Image src={assets.cross} />
          </CrossContainer>
        </PopupWrapper>
      </Popup>
    </Container>
  )
}

export default AuthPopup
