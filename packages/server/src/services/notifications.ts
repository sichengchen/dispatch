import { Bot } from "grammy";
import type { articles, digests } from "@dispatch/db";
import { getNotificationsConfig, loadSettings, saveSettings } from "./settings.js";

type Article = typeof articles.$inferSelect;
type Digest = typeof digests.$inferSelect;

type DigestContent = {
  overview?: string;
  topics?: Array<{
    topic?: string;
    keyPoints?: Array<{
      text?: string;
    }>;
  }>;
};

/**
 * Notification service for sending messages to instant messaging platforms.
 * Currently supports Telegram via Grammy bot API.
 */
class NotificationService {
  private bot: Bot | null = null;
  private botRunning: boolean = false;
  private botStartPromise: Promise<void> | null = null;
  private lastDigestSent: Date | null = null;
  private lastError: { timestamp: Date; message: string } | null = null;
  private pairingCode: string | null = null;
  private pairingChatId: string | null = null;
  private pairingExpiry: Date | null = null;

  constructor() {
    // Bot initialization happens lazily when credentials are available
  }

  /**
   * Generate a random 6-character pairing code
   */
  private generateCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Initialize or reinitialize the Telegram bot with current settings
   */
  private initializeBot(): void {
    const config = getNotificationsConfig();

    // Clean up existing bot if any
    if (this.bot) {
      if (this.botRunning) {
        this.bot.stop();
        this.botRunning = false;
      }
      this.bot = null;
      this.botStartPromise = null;
    }

    const telegramConfig = config.providers?.telegram;
    if (!telegramConfig?.botToken) {
      console.log("Telegram bot token not configured, skipping bot initialization");
      return;
    }

    // Validate bot token format
    if (!this.isValidBotToken(telegramConfig.botToken)) {
      console.warn("Invalid Telegram bot token format");
      this.lastError = {
        timestamp: new Date(),
        message: "Invalid bot token format"
      };
      return;
    }

    try {
      this.bot = new Bot(telegramConfig.botToken);

      // Register /pair command handler
      this.bot.command("pair", async (ctx) => {
        const text = ctx.message?.text ?? "";
        const match = text.match(/^\/pair(?:@\w+)?\s+(\S+)/i);
        const code = match?.[1]?.toUpperCase();

        if (!code) {
          await ctx.reply("Please provide a pairing code: /pair YOUR_CODE");
          return;
        }

        // Check if code is valid and not expired
        if (!this.pairingCode || this.pairingCode !== code) {
          await ctx.reply("Invalid pairing code. Please check the code in your Dispatch app.");
          return;
        }

        if (this.pairingExpiry && new Date() > this.pairingExpiry) {
          await ctx.reply("This pairing code has expired. Please generate a new one in your Dispatch app.");
          return;
        }

        // Store the chat ID
        const chatId = ctx.chat.id.toString();
        this.pairingChatId = chatId;

        // Persist paired chat ID to settings
        try {
          const current = loadSettings();
          const currentNotifications = current.notifications ?? getNotificationsConfig();
          const currentTelegram = currentNotifications.providers?.telegram ?? {};
          saveSettings({
            ...current,
            notifications: {
              ...currentNotifications,
              providers: {
                ...currentNotifications.providers,
                telegram: {
                  ...currentTelegram,
                  chatId
                }
              }
            }
          });
        } catch (error) {
          console.error("Failed to persist paired chat ID", error);
        }

        // Clear the pairing code after successful pairing
        this.pairingCode = null;
        this.pairingExpiry = null;

        await ctx.reply("✅ Successfully paired! Your Dispatch notifications will be sent to this chat.");
        console.log("Bot paired successfully", { chatId, chatType: ctx.chat.type });
      });

      // Start the bot to listen for commands (run in background)
      if (!this.botRunning) {
        this.botStartPromise = new Promise((resolve) => {
          this.bot?.start({
            onStart: () => {
              console.log("Telegram bot started and listening for commands");
              this.botRunning = true;
              resolve();
            }
          });
        });
      }

      console.log("Telegram bot initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Telegram bot", error);
      this.lastError = {
        timestamp: new Date(),
        message: error instanceof Error ? error.message : "Unknown error"
      };
      this.bot = null;
      this.botRunning = false;
      this.botStartPromise = null;
    }
  }

  /**
   * Validate Telegram bot token format
   * Telegram bot tokens follow the pattern: <bot_id>:<auth_token>
   * Example: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   */
  private isValidBotToken(token: string): boolean {
    if (!token || token.trim() === "") {
      return false;
    }
    // Telegram bot token format: numeric bot ID, colon, alphanumeric auth token
    const tokenRegex = /^\d+:[A-Za-z0-9_-]+$/;
    return tokenRegex.test(token);
  }

  /**
   * Escape Markdown special characters in text
   * Telegram uses MarkdownV2 which requires escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !
   */
  private escapeMarkdown(text: string): string {
    if (!text) return "";
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
  }

  /**
   * Format a daily digest into a Telegram-friendly Markdown message
   */
  private formatDigestMessage(digest: Digest): string {
    try {
      const date = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });

      let message = `📰 *Your Daily Dispatch - ${this.escapeMarkdown(date)}*\n\n`;

      // Parse digest content
      let content: DigestContent = {};
      try {
        content = JSON.parse(digest.content);
      } catch {
        // If parsing fails, use empty object
      }

      // Add overview if available
      if (content?.overview) {
        message += `${this.escapeMarkdown(content.overview)}\n\n`;
      }

      // Add topics
      if (content?.topics && Array.isArray(content.topics)) {
        const topicsToShow = content.topics.slice(0, 15); // Limit to 15 topics to avoid message size limits

        topicsToShow.forEach((topic, index) => {
          if (topic.topic) {
            message += `${index === 0 ? "🔥" : "📊"} *${this.escapeMarkdown(topic.topic)}*\n`;
          }
          if (topic.keyPoints && Array.isArray(topic.keyPoints)) {
            topic.keyPoints.slice(0, 3).forEach((point: any) => {
              if (point.text) {
                message += `• ${this.escapeMarkdown(point.text)}\n`;
              }
            });
          }
          message += "\n";
        });

        if (content.topics.length > 15) {
          message += `_\\.\\.\\. and ${content.topics.length - 15} more topics\\. View full digest in app\\._\n`;
        }
      }

      // Truncate if too long (Telegram limit is 4096 chars)
      if (message.length > 4000) {
        message = message.substring(0, 4000) + "\n\n_\\.\\.\\. message truncated\\. View full digest in app\\._";
      }

      return message;
    } catch (error) {
      console.error("Error formatting digest message", error);
      return "📰 *Daily Dispatch*\n\nError formatting digest\\. Please check the app\\.";
    }
  }

  /**
   * Format a breaking news article into a Telegram-friendly Markdown message
   */
  private formatBreakingNewsMessage(article: Article): string {
    try {
      let message = `🚨 *Breaking News Alert*\n\n`;

      if (article.title) {
        message += `*${this.escapeMarkdown(article.title)}*\n\n`;
      }

      if (article.summary) {
        message += `${this.escapeMarkdown(article.summary)}\n\n`;
      }

      if (article.grade) {
        message += `📊 Grade: ${article.grade}/100\n`;
      }

      if (article.url) {
        message += `\n🔗 [Read more](${article.url})`;
      }

      return message;
    } catch (error) {
      console.error("Error formatting breaking news message", error);
      return "🚨 *Breaking News*\n\nError formatting alert\\. Please check the app\\.";
    }
  }

  /**
   * Check if a breaking news alert should be sent for an article
   *
   * Criteria:
   * - Notifications globally enabled
   * - Breaking news alerts enabled for Telegram
   * - Article grade >= configured threshold (default: 85)
   * - Article was processed within the last 30 minutes (prevents spam from bulk imports)
   */
  shouldSendBreakingNewsAlert(article: Article): boolean {
    const config = getNotificationsConfig();

    // Check if notifications are globally enabled
    if (!config.enabled) {
      return false;
    }

    // Check if breaking news alerts are enabled for Telegram
    if (!config.providers?.telegram?.sendBreakingNews) {
      return false;
    }

    // Check if article has a grade
    if (typeof article.grade !== "number") {
      return false;
    }

    // Check grade threshold
    const threshold = config.providers.telegram.breakingNewsThreshold ?? 85;
    if (article.grade < threshold) {
      return false;
    }

    // Check recency - only alert for articles processed in the last 30 minutes
    // This prevents spam from bulk processing of old articles
    if (!article.processedAt) {
      return false;
    }

    const processedTime = article.processedAt instanceof Date
      ? article.processedAt.getTime()
      : new Date(article.processedAt).getTime();
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;

    if (processedTime < thirtyMinutesAgo) {
      console.log("Article too old for breaking news alert", {
        articleId: article.id,
        processedAt: new Date(processedTime).toISOString(),
        age: Math.round((Date.now() - processedTime) / 60000) + " minutes"
      });
      return false;
    }

    return true;
  }

  /**
   * Send a daily digest notification to Telegram
   */
  async sendDigestNotification(digest: Digest): Promise<void> {
    try {
      const config = getNotificationsConfig();

      // Check if notifications and digests are enabled
      if (!config.enabled) {
        console.log("Notifications disabled, skipping digest notification");
        return;
      }

      if (!config.providers?.telegram?.sendDigests) {
        console.log("Digest notifications disabled, skipping");
        return;
      }

      const chatId = config.providers.telegram.chatId;
      if (!chatId) {
        console.warn("Telegram chat ID not configured, skipping digest notification");
        return;
      }

      // Initialize bot if needed
      if (!this.bot) {
        this.initializeBot();
      }

      if (!this.bot) {
        console.error("Failed to initialize Telegram bot, cannot send digest");
        return;
      }

      // Format and send message
      const message = this.formatDigestMessage(digest);
      await this.bot.api.sendMessage(chatId, message, { parse_mode: "MarkdownV2" });

      // Update delivery status
      this.lastDigestSent = new Date();
      this.lastError = null;

      console.log("Digest notification sent successfully", { chatId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to send digest notification", { error: errorMessage });
      this.lastError = {
        timestamp: new Date(),
        message: errorMessage
      };
      // Don't throw - we don't want to block the digest generation workflow
    }
  }

  /**
   * Send a breaking news alert to Telegram
   */
  async sendBreakingNewsAlert(article: Article): Promise<void> {
    try {
      const config = getNotificationsConfig();

      // Check if notifications and breaking news are enabled
      if (!config.enabled) {
        console.log("Notifications disabled, skipping breaking news alert");
        return;
      }

      if (!config.providers?.telegram?.sendBreakingNews) {
        console.log("Breaking news alerts disabled, skipping");
        return;
      }

      const chatId = config.providers.telegram.chatId;
      if (!chatId) {
        console.warn("Telegram chat ID not configured, skipping breaking news alert");
        return;
      }

      // Initialize bot if needed
      if (!this.bot) {
        this.initializeBot();
      }

      if (!this.bot) {
        console.error("Failed to initialize Telegram bot, cannot send breaking news");
        return;
      }

      // Format and send message
      const message = this.formatBreakingNewsMessage(article);
      await this.bot.api.sendMessage(chatId, message, { parse_mode: "MarkdownV2" });

      console.log("Breaking news alert sent successfully", {
        chatId,
        articleId: article.id,
        grade: article.grade
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to send breaking news alert", {
        error: errorMessage,
        articleId: article.id
      });
      this.lastError = {
        timestamp: new Date(),
        message: errorMessage
      };
      // Don't throw - we don't want to block the article processing workflow
    }
  }

  /**
   * Send a test notification to verify configuration
   */
  async sendTestNotification(): Promise<{ success: boolean; error?: string }> {
    try {
      const config = getNotificationsConfig();

      const chatId = config.providers?.telegram?.chatId;
      if (!chatId) {
        throw new Error("Telegram chat ID not configured");
      }

      // Initialize bot with current settings
      this.initializeBot();

      if (!this.bot) {
        throw new Error("Failed to initialize Telegram bot. Check your bot token.");
      }

      // Send test message
      const message = "✅ *Test Notification*\n\nYour Dispatch notifications are configured correctly\\!";
      await this.bot.api.sendMessage(chatId, message, { parse_mode: "MarkdownV2" });

      console.log("Test notification sent successfully", { chatId });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to send test notification", { error: errorMessage });
      this.lastError = {
        timestamp: new Date(),
        message: errorMessage
      };
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get the current delivery status
   */
  getDeliveryStatus() {
    return {
      lastDigestSent: this.lastDigestSent,
      lastError: this.lastError
    };
  }

  /**
   * Generate a new pairing code for connecting a Telegram chat
   * The code expires after 10 minutes
   */
  async generatePairingCode(): Promise<{ code: string; expiresAt: Date }> {
    // Initialize bot if needed to start listening for commands
    const config = getNotificationsConfig();
    const telegramConfig = config.providers?.telegram;

    if (!telegramConfig?.botToken) {
      throw new Error("Bot token not configured. Please add your bot token first.");
    }

    // Initialize bot if needed
    if (!this.bot) {
      this.initializeBot();
    }

    if (!this.bot) {
      throw new Error("Failed to initialize bot. Please check your bot token.");
    }

    if (this.botStartPromise) {
      // Wait for bot to start listening before returning the code.
      // This prevents /pair commands arriving before handlers are ready.
      await this.botStartPromise;
    }

    // Generate new code and set expiry
    this.pairingCode = this.generateCode();
    this.pairingExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    this.pairingChatId = null;

    console.log("Pairing code generated", { code: this.pairingCode, expiresAt: this.pairingExpiry });

    return {
      code: this.pairingCode,
      expiresAt: this.pairingExpiry
    };
  }

  /**
   * Get the current pairing status
   * Returns the paired chat ID if pairing was successful
   */
  getPairingStatus(): {
    code: string | null;
    expiresAt: Date | null;
    chatId: string | null;
    isPaired: boolean;
  } {
    return {
      code: this.pairingCode,
      expiresAt: this.pairingExpiry,
      chatId: this.pairingChatId,
      isPaired: this.pairingChatId !== null
    };
  }

  /**
   * Clear the current pairing code and status
   */
  clearPairingCode(): void {
    this.pairingCode = null;
    this.pairingExpiry = null;
    this.pairingChatId = null;
    console.log("Pairing code cleared");
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
