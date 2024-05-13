import React from 'react'
import {
  EStacks,
  HomeStack,
  VoteStack,
  RateStack,
  InteractStack,
  CommunityStack,
} from '@app/navigation/stacks'
import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs'

import { Tab as TabComponent } from '@app/components'

import { TMainTab } from './types'

const Tab = createBottomTabNavigator<TMainTab>()

const tabBar = (props: BottomTabBarProps) => {
  return <TabComponent.Standard {...props} />
}

export const MainTab = () => {
  return (
    <Tab.Navigator
      initialRouteName={EStacks.Home}
      screenOptions={{ headerShown: false }}
      tabBar={tabBar}>
      <Tab.Screen name={EStacks.Home} component={HomeStack} />
      <Tab.Screen name={EStacks.Vote} component={VoteStack} />
      <Tab.Screen name={EStacks.Rate} component={RateStack} />
      <Tab.Screen name={EStacks.Interact} component={InteractStack} />
      <Tab.Screen name={EStacks.Community} component={CommunityStack} />
    </Tab.Navigator>
  )
}
