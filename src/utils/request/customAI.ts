import { ConfigService } from "../../assets/lib/kookit-extra-browser.min";

// 获取自定义AI配置
export const getCustomAIConfig = () => {
  return {
    apiUrl: ConfigService.getReaderConfig("customAIUrl") || "",
    apiKey: ConfigService.getReaderConfig("customAIKey") || "",
    model: ConfigService.getReaderConfig("customAIModel") || "gpt-3.5-turbo",
  };
};

// 检查是否启用了自定义AI
export const isCustomAIEnabled = () => {
  const config = getCustomAIConfig();
  return config.apiUrl && config.apiKey;
};

// 自定义AI翻译
export const customAITranslate = async (
  text: string,
  from: string,
  to: string,
  onMessage: (result: { text?: string; done?: boolean }) => void
) => {
  const config = getCustomAIConfig();
  if (!config.apiUrl || !config.apiKey) {
    throw new Error("Custom AI not configured");
  }

  const prompt = `Translate the following text from ${from === "Automatic" ? "auto-detected language" : from} to ${to}. Only output the translation, nothing else:\n\n${text}`;

  try {
    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              "You are a professional translator. Only output the translation without any explanation.",
          },
          { role: "user", content: prompt },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No reader available");
    }

    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onMessage({ done: true });
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            onMessage({ done: true });
            return { done: true, data: true };
          }
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              onMessage({ text: content });
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
    return { done: true, data: true };
  } catch (error) {
    console.error("Custom AI translate error:", error);
    throw error;
  }
};

// 自定义AI词典
export const customAIDictionary = async (
  word: string,
  from: string,
  to: string
) => {
  const config = getCustomAIConfig();
  if (!config.apiUrl || !config.apiKey) {
    throw new Error("Custom AI not configured");
  }

  const outputLang = to === "chs" ? "简体中文" : to === "cht" ? "繁体中文" : "English";
  const prompt = `Please provide a detailed dictionary entry for the word "${word}". Include:
1. Pronunciation (if applicable)
2. Part of speech
3. Definition(s) in ${outputLang}
4. Example sentences with translations

Format the response as follows:
[Pronunciation]: /xxx/
[Part of Speech]: noun/verb/adj/etc
[Definition]: definition here
[Examples]:
- Example sentence 1
  Translation 1
- Example sentence 2
  Translation 2`;

  try {
    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: `You are a professional dictionary and language expert. Provide detailed, accurate dictionary entries. Output in ${outputLang}.`,
          },
          { role: "user", content: prompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // 将内容格式化为HTML
    const htmlContent = content
      .replace(/\[Pronunciation\]:/g, '<p class="dict-word-type">[发音]</p>')
      .replace(/\[Part of Speech\]:/g, '<p class="dict-word-type">[词性]</p>')
      .replace(/\[Definition\]:/g, '<p class="dict-word-type">[释义]</p>')
      .replace(/\[Examples\]:/g, '<p class="dict-word-type">[例句]</p>')
      .replace(/\n/g, "<br>")
      + '<p class="dict-learn-more">由自定义AI生成</p>';

    return htmlContent;
  } catch (error) {
    console.error("Custom AI dictionary error:", error);
    throw error;
  }
};

// 自定义AI助手问答
export const customAIAnswer = async (
  text: string,
  question: string,
  history: { role: string; content: string }[],
  mode: string,
  onMessage: (result: { text?: string; done?: boolean }) => void
) => {
  const config = getCustomAIConfig();
  if (!config.apiUrl || !config.apiKey) {
    throw new Error("Custom AI not configured");
  }

  let systemPrompt = "";
  if (mode === "ask") {
    systemPrompt = `You are a reading assistant. The user is reading the following content and has questions about it. Help them understand the content better.

Content being read:
${text}

Please answer the user's questions based on this content. Be helpful, accurate, and concise.`;
  } else {
    systemPrompt =
      "You are a helpful assistant for reading and learning. Help users with their questions about books, reading habits, learning methods, and related topics. Be helpful, accurate, and concise.";
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: question },
  ];

  try {
    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No reader available");
    }

    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        onMessage({ done: true });
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            return { done: true, data: true };
          }
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              onMessage({ text: content });
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
    return { done: true, data: true };
  } catch (error) {
    console.error("Custom AI answer error:", error);
    throw error;
  }
};
