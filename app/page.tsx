"use client";
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CssVarsProvider,
  IconButton,
  Input,
  Sheet,
  Skeleton,
  Stack,
  Textarea,
  Typography,
  extendTheme,
} from "@mui/joy";
import useLocalStorage from "./hooks/useLocalStorage";
import { createConfig } from "hackclubai-ts";
import { useEffect, useRef, useState } from "react";
import { marked } from "marked";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ModelOption {
  id: string;
  title: string;
}

const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

const theme = extendTheme({
  cssVarPrefix: "joy",
  colorSchemes: {
    dark: {
      palette: {
        primary: {
          50: "#fef2ed",
          100: "#fddccb",
          200: "#fbb897",
          300: "#fa9563",
          400: "#f8733a", // accent
          500: "#f8733a",
          600: "#d85f2a",
          700: "#b04a20",
          800: "#883817",
          900: "#5c250f",
          solidBg: "#f8733a",
          solidHoverBg: "#e0642f",
          solidActiveBg: "#c85527",
          outlinedBorder: "#f8733a",
          outlinedColor: "#f8733a",
          plainColor: "#f8733a",
        },
      },
    },
  },
});

// ---- API helpers ---------------------------------------------------------

async function fetchModels(apiKey: string): Promise<ModelOption[]> {
  const config = createConfig(apiKey);
  const res = await fetch("/api/hcai", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hcai-api-key": apiKey },
    body: JSON.stringify({ route: config.ROUTES.models, method: "GET", body: {} }),
  });
  const data = await res.json();

  if (!data.data) {
    throw new Error("Unexpected response from HackClubAI API: " + JSON.stringify(data));
  }

  const seen = new Set<string>();
  const models: ModelOption[] = [];
  const modelsNotFree: ModelOption[] = [];
  for (const model of data.data) {
    if (seen.has(model.id)) continue;
    if (!model.id.includes(":free")) {
      modelsNotFree.push({ id: model.id, title: model.name || model.hugging_face_id || model.id });
    } else {
      
      models.push({ id: model.id, title: model.name || model.hugging_face_id || model.id });
    }
    seen.add(model.id);
  }
  return [...models, ...modelsNotFree]; // free models first
}

async function sendChatMessage(
  apiKey: string,
  model: string,
  messages: Message[]
): Promise<Message> {
  const config = createConfig(apiKey);
  const res = await fetch("/api/hcai", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-hcai-api-key": apiKey },
    body: JSON.stringify({ route: config.ROUTES.chat, body: { model, messages } }),
  });
  const data = await res.json();

  if (!data.choices?.[0]?.message) {
    throw new Error("Unexpected response from HackClubAI API: " + JSON.stringify(data));
  }
  return data.choices[0].message as Message;
}

// ---- Role styling ---------------------------------------------------------

function bubbleSx(role: Message["role"]) {
  const base = {
    bgcolor: "background.level1", // slightly lighter than page bg, not accent-colored
    borderRadius: "sm", // ~6px
    border: "1px solid",
    borderColor: "divider",
  };

  if (role === "user") {
    return {
      ...base,
      ml: "auto",
      borderLeft: "3px solid",
      borderLeftColor: "primary.400", // the accent sliver
      pl: 1.5,
    };
  }
  if (role === "system") {
    return {
      ...base,
      mx: "auto",
      color: "text.tertiary",
      fontStyle: "italic" as const,
    };
  }
  return { ...base, mr: "auto" };
}

// ---- Component --------------------------------------------------------

export default function Home() {
  const [apiKey, setApiKey] = useLocalStorage("hcaiApiKey", "");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [draft, setDraft] = useState("");
  const [models, setModels] = useState<ModelOption[]>([
    { id: DEFAULT_MODEL, title: "NVIDIA: Nemotron 3 Ultra (free)" },
  ]);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);

  const [messageHistory, setMessageHistory] = useState<Message[]>([
    { role: "system", content: "You are a helpful assistant." },
  ]);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");

  const [modelsLoading, setModelsLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!apiKey) return;
    setModelsLoading(true);
    fetchModels(apiKey)
      .then(setModels)
      .catch((err) => console.error(err))
      .finally(() => setModelsLoading(false));
  }, [apiKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageHistory, sending]);

  async function handleSend() {
    if (!apiKey) {
      alert("Please enter your HackClubAI API key first.");
      setSettingsOpen(true);
      return;
    }
    if (!draft.trim()) return;

    const newMessages = [...messageHistory, { role: "user", content: draft } as Message];
    setMessageHistory(newMessages);
    setDraft("");
    setSending(true);

    try {
      const reply = await sendChatMessage(apiKey, selectedModel, newMessages);
      setMessageHistory([...newMessages, reply]);
    } catch (err) {
      console.error(err);
      alert("Error calling HackClubAI API. Check the console for details.");
    } finally {
      setSending(false);
    }
  }

  function startEditing(index: number) {
    setEditingIndex(index);
    setEditingContent(messageHistory[index].content);
  }

  function saveEdit(index: number) {
    const newHistory = [...messageHistory];
    newHistory[index] = { ...newHistory[index], content: editingContent };
    setMessageHistory(newHistory);
    setEditingIndex(null);
  }

  function cancelEdit() {
    setEditingIndex(null);
  }

  function removeMessage(index: number) {
    const newHistory = [...messageHistory];
    newHistory.splice(index, 1);
    setMessageHistory(newHistory);
  }

  return (
    <CssVarsProvider theme={theme} defaultMode="dark">
      <Sheet
        variant="soft"
        sx={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 760, display: "flex", flexDirection: "column", height: "100%" }}>
          {/* Header */}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}
          >
            <Typography level="title-lg"><img src="/brand/logo_wide.svg" color="#fff" style={{filter: 'invert(1)', height: '60px', scale: '1.5'}} /></Typography>
            <Button
              size="sm"
              variant={settingsOpen ? "solid" : "outlined"}
              color={settingsOpen ? "primary" : "neutral"}
              onClick={() => setSettingsOpen((s) => !s)}
              sx={{ borderRadius: "sm" }}
            >
              Settings
            </Button>
          </Stack>

          {/* Settings panel */}
          {settingsOpen && (
            <Card variant="outlined" sx={{ m: 2, mb: 0, p: 2 }}>
              <Stack spacing={1.5}>
                <Typography level="title-sm">API Key</Typography>
                <Input
                  placeholder="Enter your HackClubAI API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />

                <Typography level="title-sm" sx={{ mt: 1 }}>
                  Model
                </Typography>
                {modelsLoading ? (
                  <Skeleton variant="rectangular" height={40} sx={{ borderRadius: "sm" }} />
                ) : (
                  <Autocomplete
                    options={models.map((m) => m.id)}
                    getOptionLabel={(id) => models.find((m) => m.id === id)?.title || "No title"}
                    value={selectedModel}
                    onChange={(_, value) => setSelectedModel(value ?? DEFAULT_MODEL)}
                    placeholder="Select a model"
                  />
                )}
              </Stack>
            </Card>
          )}

          {/* Message thread */}
          <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 2 }}>
            <Stack spacing={1.5}>
              {messageHistory.map((msg, index) => (
                <Box key={index} sx={{ display: "flex", flexDirection: "column", maxWidth: "85%", ...bubbleSx(msg.role), borderRadius: "lg", p: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography level="body-xs" sx={{ textTransform: "uppercase", opacity: 0.7 }}>
                      {msg.role}
                    </Typography>
                    {editingIndex !== index && (
                      <Stack direction="row" spacing={0.5}>
                        <IconButton size="sm" variant="plain" onClick={() => startEditing(index)}>
                          ✎
                        </IconButton>
                        <IconButton size="sm" variant="plain" color="danger" onClick={() => removeMessage(index)}>
                          ✕
                        </IconButton>
                      </Stack>
                    )}
                  </Stack>

                  {editingIndex === index ? (
                    <Stack spacing={1}>
                      <Textarea
                        minRows={2}
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        sx={{ bgcolor: "background.surface" }}
                      />
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button size="sm" variant="plain" onClick={cancelEdit}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={() => saveEdit(index)} sx={{ borderRadius: "sm" }}>
                          Save
                        </Button>
                      </Stack>
                    </Stack>
                  ) : (
                    <Typography level="body-sm" sx={{ whiteSpace: "pre-wrap" }}>
                      <div dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) }} />
                    </Typography>
                  )}
                </Box>
              ))}

              {sending && (
                <Box sx={{ maxWidth: "85%", ...bubbleSx("assistant"), borderRadius: "lg", p: 1.5 }}>
                  <Skeleton variant="text" level="body-xs" width="20%" />
                  <Skeleton variant="text" level="body-sm" width="90%" />
                  <Skeleton variant="text" level="body-sm" width="70%" />
                </Box>
              )}
              <div ref={bottomRef} />
            </Stack>
          </Box>

          {/* Composer */}
          <Stack
            direction="row"
            spacing={1}
            sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}
          >
            <Textarea
              placeholder="Message..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              minRows={1}
              maxRows={6}
              sx={{ flex: 1 }}
            />
            <Button
              onClick={handleSend}
              loading={sending}
              sx={{ alignSelf: "flex-end", borderRadius: "sm" }}
            >
              Send
            </Button>
          </Stack>
        </Box>
      </Sheet>
    </CssVarsProvider>
  );
}