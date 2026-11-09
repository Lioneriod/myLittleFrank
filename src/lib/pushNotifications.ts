import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

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
  const { error } = await supabase.rpc("register_push_token", {
    push_token: token,
    device_platform: Platform.OS,
  });
  if (error) throw error;

  registeredToken = token;
  return token;
}

export async function unregisterPushToken() {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  const { error } = await supabase.rpc("unregister_push_token", { push_token: token });
  if (error) console.warn("unregister_push_token falhou:", error.message);
}
