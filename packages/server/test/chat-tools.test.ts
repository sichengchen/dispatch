import { describe, expect, it } from "vitest";
import { createPresentChoicesTool, createChatToolSet } from "../src/services/agents/tools";

describe("Chat Tools", () => {
  describe("present_choices tool", () => {
    const tool = createPresentChoicesTool();

    it("has correct tool description", () => {
      expect(tool.description).toContain("multiple-choice");
      expect(tool.description).toContain("clickable buttons");
    });

    it("accepts valid input with 2 options", async () => {
      const result = await tool.execute({
        question: "Do you want to continue?",
        options: [
          { label: "Yes", value: "yes" },
          { label: "No", value: "no" },
        ],
      }, { toolCallId: "test", messages: [] });

      expect(result.success).toBe(true);
      expect(result.instruction).toContain("```choices");
      expect(result.instruction).toContain("Do you want to continue?");
    });

    it("accepts valid input with 4 options", async () => {
      const result = await tool.execute({
        question: "Choose your preference",
        options: [
          { label: "Option A", value: "a" },
          { label: "Option B", value: "b" },
          { label: "Option C", value: "c" },
          { label: "Option D", value: "d" },
        ],
      }, { toolCallId: "test", messages: [] });

      expect(result.success).toBe(true);
      expect(result.instruction).toContain("Option A");
      expect(result.instruction).toContain("Option D");
    });

    it("includes context when provided", async () => {
      const result = await tool.execute({
        question: "Which method?",
        options: [
          { label: "RSS", value: "rss" },
          { label: "Agentic", value: "agentic" },
        ],
        context: "The RSS feed contains truncated content.",
      }, { toolCallId: "test", messages: [] });

      expect(result.success).toBe(true);
      expect(result.instruction).toContain("truncated content");
    });

    it("generates valid JSON in choices block", async () => {
      const result = await tool.execute({
        question: "Test question",
        options: [
          { label: "First", value: "first" },
          { label: "Second", value: "second" },
        ],
      }, { toolCallId: "test", messages: [] });

      expect(result.success).toBe(true);

      // Extract JSON from the choices block
      const match = result.instruction?.match(/```choices\n([\s\S]*?)\n```/);
      expect(match).toBeTruthy();

      const json = JSON.parse(match![1]);
      expect(json.question).toBe("Test question");
      expect(json.options).toHaveLength(2);
      expect(json.options[0].label).toBe("First");
      expect(json.options[0].value).toBe("first");
    });

    it("instructs agent to wait for user response", async () => {
      const result = await tool.execute({
        question: "Test",
        options: [
          { label: "A", value: "a" },
          { label: "B", value: "b" },
        ],
      }, { toolCallId: "test", messages: [] });

      expect(result.instruction).toContain("Wait for the user");
    });
  });

  describe("createChatToolSet", () => {
    it("exports present_choices and finish_conversation tools", () => {
      const toolSet = createChatToolSet();

      expect(toolSet).toHaveProperty("present_choices");
      expect(typeof toolSet.present_choices.execute).toBe("function");
      expect(toolSet).toHaveProperty("finish_conversation");
      expect(typeof toolSet.finish_conversation.execute).toBe("function");
    });
  });

  describe("Choice block JSON format", () => {
    it("produces parseable JSON structure", () => {
      const question = "How would you like to add this source?";
      const options = [
        { label: "Use RSS feed", value: "rss" },
        { label: "Use agentic extraction", value: "agentic" },
      ];

      const json = JSON.stringify({ question, options });
      const parsed = JSON.parse(json);

      expect(parsed.question).toBe(question);
      expect(parsed.options).toEqual(options);
    });

    it("handles special characters in labels", () => {
      const options = [
        { label: "Yes, continue", value: "yes" },
        { label: "No - cancel", value: "no" },
        { label: 'Option with "quotes"', value: "quoted" },
      ];

      const json = JSON.stringify({ question: "Test?", options });
      const parsed = JSON.parse(json);

      expect(parsed.options[2].label).toBe('Option with "quotes"');
    });
  });
});
