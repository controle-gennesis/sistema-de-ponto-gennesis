import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Sparkles, Send } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import AppHeader from '../components/AppHeader';
import api from '../services/api';

type ChatMessage = {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  sender?: { id?: string; name?: string | null } | null;
};

export default function FieldAssistantScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const loadChat = async (id: string) => {
    const res = await api.get(`/api/chats/direct/${id}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Não foi possível abrir o assistente.');
    const chat = json.data || json;
    setMessages(Array.isArray(chat.messages) ? chat.messages : []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post('/api/chats/direct/gennecy', {});
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || 'Falha ao abrir a Gennecy.');
        const chat = json.data || json;
        if (cancelled) return;
        setChatId(chat.id);
        await loadChat(chat.id);
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!chatId) return;
    const timer = setInterval(() => {
      void loadChat(chatId).catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [chatId]);

  const send = async () => {
    if (!chatId || !draft.trim() || sending) return;
    const content = draft.trim();
    setDraft('');
    setSending(true);
    try {
      await api.post('/api/chats/direct/messages', { chatId, content });
      await loadChat(chatId);
    } catch {
      setDraft(content);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.safe}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.head}>
          <View style={styles.icon}>
            <Sparkles size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Assistente de campo</Text>
            <Text style={styles.subtitle}>
              A Gennecy ajuda com dúvidas da função, OS, combustível e procedimentos.
            </Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 28 }} color={colors.primary} />
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <Text style={styles.empty}>
                Envie uma pergunta sobre a localidade, o checklist ou o procedimento do dia.
              </Text>
            ) : (
              messages.map((msg) => {
                const mine = msg.senderId === user?.id;
                return (
                  <View key={msg.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                    {!mine ? (
                      <Text style={styles.sender}>{msg.sender?.name || 'Gennecy'}</Text>
                    ) : null}
                    <Text style={[styles.bubbleText, mine && { color: '#fff' }]}>{msg.content}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Pergunte à Gennecy..."
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            multiline
          />
          <TouchableOpacity
            style={[styles.send, (!draft.trim() || sending || !chatId) && { opacity: 0.45 }]}
            disabled={!draft.trim() || sending || !chatId}
            onPress={() => void send()}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Send size={16} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safe: { flex: 1 },
    head: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 12,
      alignItems: 'center',
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 20, fontWeight: '800', color: colors.text },
    subtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
    list: { paddingHorizontal: 20, paddingBottom: 16, gap: 10 },
    empty: { color: colors.textSecondary, lineHeight: 20, marginTop: 12 },
    bubble: {
      maxWidth: '86%',
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    mine: {
      alignSelf: 'flex-end',
      backgroundColor: colors.primary,
    },
    theirs: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)',
    },
    sender: { fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 3 },
    bubbleText: { color: colors.text, fontSize: 15, lineHeight: 21 },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: 16,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    send: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
