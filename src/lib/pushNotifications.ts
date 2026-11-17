import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import * as api from "./api";

let registeredToken: string | null = null;

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function easProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

function pushSupported() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
  if (Platform.OS === "android" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return false;
  }
  return !!easProjectId();
}

export async function registerPushToken(): Promise<string | null> {
  if (!pushSupported()) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Avisos do Frank",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== "granted") return null;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: easProjectId() });
  await api.registerPushToken(token, Platform.OS);

  registeredToken = token;
  return token;
}

export async function unregisterPushToken() {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  try {
    await api.unregisterPushToken(token);
  } catch (err) {
    console.warn("Não foi possível remover o token de push:", api.friendlyError(err));
  }
}
