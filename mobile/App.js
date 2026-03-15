import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import HomeScreen from "./screens/HomeScreen";
import TranscribeScreen from "./screens/TranscribeScreen";
import TranscriptionDetailScreen from "./screens/TranscriptionDetailScreen";
import JournalHomeScreen from "./screens/JournalHomeScreen";
import JournalFolderScreen from "./screens/JournalFolderScreen";
import JournalEntryScreen from "./screens/JournalEntryScreen";

const Tab = createBottomTabNavigator();
const TranscriptStack = createNativeStackNavigator();
const JournalStack = createNativeStackNavigator();

const stackScreenOptions = {
  headerStyle: { backgroundColor: "#1A1A1A" },
  headerTintColor: "#FFF",
  headerTitleStyle: { fontWeight: "700" },
  contentStyle: { backgroundColor: "#111" },
};

function TranscriptStackScreen() {
  return (
    <TranscriptStack.Navigator screenOptions={stackScreenOptions}>
      <TranscriptStack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "Diktafon" }}
      />
      <TranscriptStack.Screen
        name="Transcribe"
        component={TranscribeScreen}
        options={{ title: "Novi transkript" }}
      />
      <TranscriptStack.Screen
        name="Detail"
        component={TranscriptionDetailScreen}
        options={{ title: "Transkript" }}
      />
    </TranscriptStack.Navigator>
  );
}

function JournalStackScreen() {
  return (
    <JournalStack.Navigator screenOptions={stackScreenOptions}>
      <JournalStack.Screen
        name="JournalHome"
        component={JournalHomeScreen}
        options={{ title: "Dnevnik" }}
      />
      <JournalStack.Screen
        name="JournalFolder"
        component={JournalFolderScreen}
        options={({ route }) => ({ title: route.params?.name || "Folder" })}
      />
      <JournalStack.Screen
        name="JournalEntry"
        component={JournalEntryScreen}
        options={{ title: "Zapis" }}
      />
    </JournalStack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: "#1A1A1A", borderTopColor: "#2A2A2A" },
          tabBarActiveTintColor: "#4A9EFF",
          tabBarInactiveTintColor: "#888",
        }}
      >
        <Tab.Screen
          name="TranskriptiTab"
          component={TranscriptStackScreen}
          options={{
            title: "Transkripti",
            tabBarIcon: ({ color, size }) => (
              <Text style={{ fontSize: size, color }}>📝</Text>
            ),
          }}
        />
        <Tab.Screen
          name="DnevnikTab"
          component={JournalStackScreen}
          options={{
            title: "Dnevnik",
            tabBarIcon: ({ color, size }) => (
              <Text style={{ fontSize: size, color }}>🎙️</Text>
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
