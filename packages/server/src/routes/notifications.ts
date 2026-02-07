import { z } from "zod";
import { t } from "../trpc.js";
import {
  getNotificationsConfig,
  saveSettings,
  loadSettings,
  type NotificationsConfig
} from "../services/settings.js";
import { notificationService } from "../services/notifications.js";

const telegramConfigSchema = z.object({
  botToken: z.string().optional(),
  chatId: z.string().optional(),
  sendDigests: z.boolean().optional(),
  sendBreakingNews: z.boolean().optional(),
  breakingNewsThreshold: z.number().min(0).max(100).optional(),
});

const notificationsConfigSchema = z.object({
  enabled: z.boolean().optional(),
  providers: z.object({
    telegram: telegramConfigSchema.optional(),
  }).optional(),
});

export const notificationsRouter = t.router({
  /**
   * Get current notification settings
   */
  getSettings: t.procedure.query(() => {
    return getNotificationsConfig();
  }),

  /**
   * Update notification settings
   */
  updateSettings: t.procedure
    .input(notificationsConfigSchema)
    .mutation(({ input }) => {
      const currentSettings = loadSettings();
      const updatedSettings = saveSettings({
        ...currentSettings,
        notifications: input
      });
      return updatedSettings.notifications;
    }),

  /**
   * Send a test notification to verify configuration
   */
  testNotification: t.procedure.mutation(async () => {
    const result = await notificationService.sendTestNotification();
    if (!result.success) {
      throw new Error(result.error || "Failed to send test notification");
    }
    return { success: true, message: "Test notification sent successfully" };
  }),

  /**
   * Get delivery status (last digest sent, last error)
   */
  getDeliveryStatus: t.procedure.query(() => {
    return notificationService.getDeliveryStatus();
  }),

  /**
   * Generate a pairing code for connecting a Telegram chat
   */
  generatePairingCode: t.procedure.mutation(() => {
    return notificationService.generatePairingCode();
  }),

  /**
   * Get the current pairing status
   */
  getPairingStatus: t.procedure.query(() => {
    return notificationService.getPairingStatus();
  }),

  /**
   * Clear the current pairing code
   */
  clearPairingCode: t.procedure.mutation(() => {
    notificationService.clearPairingCode();
    return { success: true };
  }),
});
