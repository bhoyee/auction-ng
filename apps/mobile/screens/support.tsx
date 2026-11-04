import { useEffect, useRef, useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import {
  createSupportClient,
  connectSupport,
} from '@auction-ng/api-client/support';
import {
  supportFaqs,
  type SupportCreate,
  type SupportMessageInput,
  type SupportAction,
  type SupportConversation,
} from '@auction-ng/shared';
import { Page, Private, Notice, Pagination } from '../components/ui/page';
import { Body, Button, Input, Dialog } from '../components/ui/controls';
import { n } from '../components/ui/native-styles';
import { apiUrl, realtimeUrl } from '../lib/config';
import { useSession } from '../lib/session';
import { useLiveRead } from '../lib/live-read';
import { supportStyles as st } from '../components/ui/support-styles';
export default function SupportScreen() {
  const { manager, session } = useSession();
  const params = useLocalSearchParams<{ conversation?: string }>();
  const [filter, setFilter] = useState('all'),
    [chat, setChat] = useState(false),
    [minimized, setMinimized] = useState(false),
    [conversation, setConversation] = useState<SupportConversation>(),
    [text, setText] = useState(''),
    [subject, setSubject] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [cursor, setCursor] = useState<string>(),
    [pages, setPages] = useState<(string | undefined)[]>([]),
    [messageCursor, setMessageCursor] = useState<string>(),
    [images, setImages] = useState<NonNullable<SupportMessageInput['images']>>(
      [],
    );
  const createAttempt = useRef<SupportCreate | undefined>(undefined),
    sendAttempt = useRef<SupportMessageInput | undefined>(undefined),
    actionAttempt = useRef<SupportAction | undefined>(undefined);
  const read = useLiveRead(
    () =>
      manager.run((c) =>
        createSupportClient(apiUrl, c).list({
          status: filter as 'all' | 'open' | 'in_progress' | 'resolved',
          limit: 10,
          cursor,
        }),
      ),
    [filter, cursor, session?.user.id],
    5000,
  );
  const messages = useLiveRead(
    async () => {
      if (!conversation) throw Error('Choose a conversation.');
      return manager.run(async (c) => {
        const api = createSupportClient(apiUrl, c);
        const [row, items] = await Promise.all([
          api.get(conversation.id),
          api.messages(conversation.id, messageCursor),
        ]);
        return { row, ...items };
      });
    },
    [conversation?.id, messageCursor, session?.user.id],
    5000,
  );
  const availability = useLiveRead(
    () => manager.run((c) => createSupportClient(apiUrl, c).availability()),
    [session?.user.id],
  );
  useEffect(() => {
    if (params.conversation && session)
      void manager
        .run((c) =>
          createSupportClient(apiUrl, c).get(params.conversation ?? ''),
        )
        .then((row) => {
          setConversation(row);
          setChat(true);
        })
        .catch(() => setError('Conversation could not be opened.'));
  }, [params.conversation, session?.user.id, manager]);
  useEffect(() => {
    if (!session || !manager.identity) return;
    return connectSupport(
      realtimeUrl,
      { accessToken: session.accessToken, deviceId: manager.identity.deviceId },
      () => {
        read.refresh();
        messages.refresh();
      },
      () => {},
    );
  }, [session?.accessToken, manager]);
  const current = messages.data?.row ?? conversation;
  async function send() {
    setBusy(true);
    setError('');
    try {
      if (!current) {
        createAttempt.current ??= {
          subject: subject.trim() || 'Customer support request',
          topic: 'account',
          text,
          reference: '',
          human: false,
          idempotencyKey: Crypto.randomUUID(),
        };
        const row = await manager.run((c) =>
          createSupportClient(apiUrl, c).create(
            createAttempt.current as SupportCreate,
          ),
        );
        setConversation(row);
        createAttempt.current = undefined;
      } else {
        sendAttempt.current ??= {
          text,
          images,
          internal: false,
          idempotencyKey: Crypto.randomUUID(),
        };
        await manager.run((c) =>
          createSupportClient(apiUrl, c).send(
            current.id,
            sendAttempt.current as SupportMessageInput,
          ),
        );
        sendAttempt.current = undefined;
      }
      setText('');
      setImages([]);
      read.refresh();
      messages.refresh();
    } catch {
      setError('Message could not be confirmed. Retry this same message.');
    } finally {
      setBusy(false);
    }
  }
  async function handoff() {
    if (!current) {
      createAttempt.current ??= {
        subject: 'Support team request',
        topic: 'account',
        text: 'I need to talk to a human support agent.',
        reference: '',
        human: true,
        idempotencyKey: Crypto.randomUUID(),
      };
      await send();
      return;
    }
    setBusy(true);
    try {
      actionAttempt.current ??= {
        action: current.status === 'resolved' ? 'reopen' : 'handoff',
        expectedVersion: current.version,
        idempotencyKey: Crypto.randomUUID(),
      };
      setConversation(
        await manager.run((c) =>
          createSupportClient(apiUrl, c).action(
            current.id,
            actionAttempt.current as SupportAction,
          ),
        ),
      );
      actionAttempt.current = undefined;
      messages.refresh();
      read.refresh();
    } catch {
      setError(
        'Handoff could not be confirmed. Retry or check the conversation.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function attach() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Allow photo access to attach a support image.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.2,
      allowsEditing: true,
    });
    if (picked.canceled) return;
    const image = picked.assets[0];
    if (!image?.base64 || image.base64.length > 400000) {
      setError(
        'Choose a smaller photo, under 300 KB, to send on a weak connection.',
      );
      return;
    }
    setImages([{ mime: 'image/jpeg', data: image.base64 }]);
  }
  const composer = (
    <View style={st.composer}>
      <Input
        label="Your message"
        style={st.message}
        multiline
        value={text}
        editable={!busy && !sendAttempt.current && !createAttempt.current}
        onChangeText={setText}
      />
      {images.length > 0 && (
        <Notice tone="warning" message="One image is ready to send." />
      )}
      {availability.data?.attachmentsEnabled && current && (
        <Button size="small" variant="secondary" onPress={() => void attach()}>
          Attach photo
        </Button>
      )}
      <View style={st.actions}>
        <View style={st.action}>
          <Button
            fullWidth
            busy={busy}
            disabled={!text.trim() && !images.length}
            onPress={() => void send()}
          >
            {sendAttempt.current || createAttempt.current
              ? 'Retry same message'
              : 'Send message'}
          </Button>
        </View>
        <View style={st.action}>
          <Button
            fullWidth
            variant="success"
            busy={busy}
            onPress={() => void handoff()}
          >
            {current?.status === 'resolved'
              ? 'Reopen conversation'
              : 'Talk to support'}
          </Button>
        </View>
      </View>
    </View>
  );
  return (
    <Page title="Customer Service">
      <Private>
        <Body tone="section">How can we help?</Body>
        <Body tone="secondary">
          Start with our guided assistant, or ask our support team. Your
          conversations stay together across the app and website.
        </Body>
        <Notice
          message={error || read.error}
          onClose={() => {
            setError('');
            read.refresh();
          }}
        />
        <Button
          onPress={() => {
            setChat(true);
            setMinimized(false);
          }}
        >
          Start conversation
        </Button>
        <ScrollView
          horizontal
          style={st.tabScroll}
          accessibilityRole="tablist"
          accessibilityLabel="Conversation status"
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.tabs}
        >
          {['all', 'open', 'in_progress', 'resolved'].map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === value }}
              style={[st.tab, filter === value && st.activeTab]}
              onPress={() => {
                setFilter(value);
                setCursor(undefined);
                setPages([]);
              }}
            >
              <Body style={[st.tabText, filter === value && st.white]}>
                {value === 'all'
                  ? 'All'
                  : value === 'open'
                    ? 'Open'
                    : value === 'in_progress'
                      ? 'In Progress'
                      : 'Resolved'}
              </Body>
            </Pressable>
          ))}
        </ScrollView>
        {read.data?.items.map((row) => (
          <Pressable
            key={row.id}
            style={n.surface}
            accessibilityRole="button"
            onPress={() => {
              setConversation(row);
              setChat(true);
              setMinimized(false);
              setMessageCursor(undefined);
            }}
          >
            <View style={st.cardHeading}>
              <Body style={[n.grow, n.bold]}>{row.subject}</Body>
              <View
                style={[
                  st.badge,
                  row.status === 'open'
                    ? st.open
                    : row.status === 'in_progress'
                      ? st.progress
                      : st.resolved,
                ]}
              >
                <Body
                  tone="fine"
                  style={[
                    n.bold,
                    row.status === 'in_progress' ? st.dark : st.white,
                  ]}
                >
                  {row.status === 'open'
                    ? 'Open'
                    : row.status === 'in_progress'
                      ? 'In Progress'
                      : 'Resolved'}
                </Body>
              </View>
            </View>
            <Body tone="fine">
              {row.number} -{' '}
              {new Date(row.updatedAt).toLocaleString('en-NG', {
                timeZone: 'Africa/Lagos',
              })}{' '}
              WAT
            </Body>
          </Pressable>
        ))}
        {read.data?.items.length === 0 && (
          <Body>No conversations in this section.</Body>
        )}
        <Pagination
          previous={
            pages.length
              ? () => {
                  setCursor(pages.at(-1));
                  setPages((p) => p.slice(0, -1));
                }
              : undefined
          }
          next={
            read.data?.nextCursor
              ? () => {
                  setPages((p) => [...p, cursor]);
                  setCursor(read.data?.nextCursor ?? undefined);
                }
              : undefined
          }
        />
        {minimized && (
          <Button
            onPress={() => {
              setMinimized(false);
              setChat(true);
            }}
          >
            Continue support chat
          </Button>
        )}
        <Dialog
          open={chat && !minimized}
          expanded
          footer={composer}
          title={current?.number ?? 'LotVanta support'}
          presentation="sheet"
          onClose={() => setChat(false)}
        >
          <View style={st.conversation}>
            <View style={n.between}>
              <Body tone="secondary">
                {availability.data?.available
                  ? 'Support team available'
                  : 'Send a message; our team will reply when available.'}
              </Body>
              <Button
                size="small"
                variant="ghost"
                onPress={() => setMinimized(true)}
              >
                Minimise
              </Button>
            </View>
            <Notice
              message={error || messages.error}
              onClose={() => {
                setError('');
                messages.refresh();
              }}
            />
            {!current ? (
              <>
                <Input
                  label="Subject"
                  value={subject}
                  onChangeText={setSubject}
                />
                {supportFaqs.map((faq) => (
                  <Pressable
                    style={n.link}
                    key={faq.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setSubject(faq.title);
                      setText(faq.title);
                    }}
                  >
                    <Body>{faq.title}</Body>
                  </Pressable>
                ))}
              </>
            ) : (
              <>
                <Body style={n.bold}>{current.subject}</Body>
                {messages.data?.items.map((message) => (
                  <View
                    key={message.id}
                    style={[n.surface, message.author === 'buyer' && n.shade]}
                  >
                    <Body tone="fine" style={n.bold}>
                      {message.authorName}
                    </Body>
                    <Body>{message.text}</Body>
                    {message.attachments.map((image) => (
                      <Image
                        key={image.id}
                        source={{
                          uri: apiUrl + '/support/attachments/' + image.id,
                          headers: {
                            Authorization:
                              'Bearer ' + (session?.accessToken ?? ''),
                            'X-Device-Id': manager.identity?.deviceId ?? '',
                          },
                        }}
                        cachePolicy="none"
                        style={{ height: 180, width: '100%' }}
                        contentFit="contain"
                      />
                    ))}
                  </View>
                ))}
                {messages.data?.nextCursor && (
                  <Button
                    variant="secondary"
                    onPress={() =>
                      setMessageCursor(messages.data?.nextCursor ?? undefined)
                    }
                  >
                    Earlier messages
                  </Button>
                )}
              </>
            )}
          </View>
        </Dialog>
      </Private>
    </Page>
  );
}
