import * as Notifications from "expo-notifications"
import * as Sentry from "@sentry/react-native"
import { t } from "../src/i18n"
import {
  fetchReminder,
  markReminderDone,
  snoozeReminder,
  updateReminder,
  getNextOccurrence,
} from "../src/services/storage"

const REMINDER_CATEGORY = "reminder"
const SNOOZE_MINUTES = 5
const OFFSET_MINUTES = 0

export function initNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const { reminderId } = notification.request.content.data || {}
      if (reminderId) {
        const reminder = await fetchReminder(reminderId)
        if (!reminder) {
          return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false }
        }
      }
      return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true }
    },
  })

  Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
    {
      identifier: "snooze",
      buttonTitle: t("reminders.snoozeAction"),
      options: { isDestructive: false },
    },
    {
      identifier: "done",
      buttonTitle: t("reminders.doneAction"),
      options: { isDestructive: false },
    },
  ]).catch((e) => {
    if (__DEV__) console.warn("Failed to set notification category:", e)
  })
}

export async function requestPermissions() {
  const { status: existing } = await Notifications.getPermissionsAsync()
  if (existing === "granted") return true
  const { status } = await Notifications.requestPermissionsAsync()
  return status === "granted"
}

export async function scheduleReminderNotification(reminder) {
  const notificationTime = new Date(reminder.notification_time)
  const secondsUntil = Math.max(
    1,
    Math.floor((notificationTime.getTime() - Date.now()) / 1000)
  )

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: t("reminders.notificationTitle"),
      body: reminder.action,
      data: { reminderId: reminder.id },
      categoryIdentifier: REMINDER_CATEGORY,
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: secondsUntil,
    },
  })
  return id
}

export async function cancelNotification(notificationId) {
  if (!notificationId) return
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId)
  } catch {
    // Already fired or cancelled
  }
}

export async function dismissNotification(notificationId) {
  if (!notificationId) return
  try {
    await Notifications.dismissNotificationAsync(notificationId)
  } catch {
    // Not in notification center
  }
}

async function scheduleNextOccurrence(reminderId) {
  const reminder = await fetchReminder(reminderId)
  if (!reminder || !reminder.recurrence) return

  const nextTime = getNextOccurrence(reminder)
  if (!nextTime) return

  const nextNotificationTime = new Date(
    new Date(nextTime).getTime() - OFFSET_MINUTES * 60 * 1000
  ).toISOString()

  const updated = await updateReminder(reminderId, {
    reminder_time: nextTime,
    notification_time: nextNotificationTime,
    status: "pending",
    notification_id: null,
  })

  if (updated) {
    const notificationId = await scheduleReminderNotification(updated)
    await updateReminder(reminderId, { notification_id: notificationId })
  }
}

export function handleNotificationResponse(navigationRef) {
  return async (response) => {
    try {
      const { reminderId } = response.notification.request.content.data || {}
      if (!reminderId) return

      const actionId = response.actionIdentifier

      if (actionId === "snooze") {
        const reminder = await fetchReminder(reminderId)
        if (!reminder) return
        await snoozeReminder(reminderId)
        const snoozeTime = new Date(
          Date.now() + SNOOZE_MINUTES * 60 * 1000
        ).toISOString()
        const notificationId = await scheduleReminderNotification({
          ...reminder,
          notification_time: snoozeTime,
        })
        await updateReminder(reminderId, { notification_id: notificationId })
        return
      }

      if (actionId === "done") {
        const reminder = await fetchReminder(reminderId)
        if (!reminder) return
        await markReminderDone(reminderId)
        if (reminder.recurrence) {
          await scheduleNextOccurrence(reminderId)
        }
        return
      }

      // Default tap — navigate to Reminders screen
      const reminder = await fetchReminder(reminderId)
      if (!reminder) return
      if (navigationRef?.isReady()) {
        navigationRef.navigate("RemindersTab", { screen: "RemindersRoot" })
      }
    } catch (e) {
      Sentry.captureException(e)
      if (__DEV__) console.warn("Notification response error:", e)
    }
  }
}
