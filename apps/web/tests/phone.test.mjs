import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivedLabel, careerSummary, contacts, inbox, markRead, newPhone, normalizePhone, phoneMessages, readPhone,
  receiveMessages, threads, unreadCount, writePhone } from '../src/world/phone.mjs';
import { NEW_STORY, advanceStory, markSceneSeen } from '../src/world/storyChapters.mjs';
import { chooseNpcReply, newNpcRelations } from '../src/world/npcConversations.mjs';
import { joinCareer, normalizeCareer } from '../src/world/careers.mjs';

const memory = () => { const store = new Map(); return { store, getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) }; };
const base = { story: { ...NEW_STORY }, relations: newNpcRelations(), career: normalizeCareer(null), now: { day: 1, minute: 8 * 60, energy: 90 } };

test('Mom texts every morning; story texts appear once their scene has played and count as read', () => {
  let messages = phoneMessages(base);
  assert.deepEqual(messages.map(m => m.id), ['mom:morning:1'], 'scene not seen yet, so no story text');
  const seen = markSceneSeen(base.story);
  messages = phoneMessages({ ...base, story: seen });
  assert.ok(messages.some(m => m.kind === 'story' && m.from === 'mom' && /Big day/.test(m.text)));
  const { phone, fresh } = receiveMessages(newPhone(), messages, base.now);
  assert.deepEqual(fresh, ['mom:morning:1'], 'only the daily text buzzes');
  assert.equal(unreadCount(phone, messages), 1);
  // Nothing new on the next check: no repeated buzz.
  assert.deepEqual(receiveMessages(phone, messages, base.now).fresh, []);
  assert.equal(receiveMessages(phone, messages, base.now).phone, phone, 'unchanged state is the same object');
});

test('no morning text before you wake; an evening nudge only while you are out', () => {
  assert.equal(phoneMessages({ ...base, now: { day: 2, minute: 6 * 60 } }).filter(m => m.id === 'mom:morning:2').length, 0);
  assert.ok(phoneMessages({ ...base, now: { day: 2, minute: 6 * 60 } }).some(m => m.id === 'mom:morning:1'), 'yesterday still there');
  const late = { day: 2, minute: 20 * 60 };
  assert.ok(phoneMessages({ ...base, now: late, location: 'city' }).some(m => m.id === 'mom:evening:2'));
  assert.ok(!phoneMessages({ ...base, now: late, location: 'home' }).some(m => m.id === 'mom:evening:2'));
  assert.ok(phoneMessages({ ...base, now: { day: 2, minute: 9 * 60, energy: 10 } }).some(m => m.id === 'mom:tired:2'));
});

test('daily texts keep a few days of history and arrive on their own morning', () => {
  const messages = phoneMessages({ ...base, now: { day: 9, minute: 10 * 60 } });
  assert.deepEqual(messages.filter(m => m.id.startsWith('mom:morning')).map(m => m.id), ['mom:morning:7', 'mom:morning:8', 'mom:morning:9']);
  const { phone } = receiveMessages(newPhone(), messages, { day: 9, minute: 600 });
  assert.deepEqual(phone.arrived['mom:morning:7'], { day: 7, minute: 7 * 60 });
  const list = inbox(phone, messages);
  assert.equal(list[0].id, 'mom:morning:9', 'newest first');
  assert.equal(arrivedLabel(list[0].at, 9), '10:00');
  assert.equal(arrivedLabel(phone.arrived['mom:morning:8'], 9), 'Yesterday');
  assert.equal(arrivedLabel(phone.arrived['mom:morning:7'], 9), 'Day 7');
});

test('friends you get on with text you; contacts list the people you have met', () => {
  let relations = newNpcRelations();
  assert.deepEqual(contacts(relations).map(c => c.id), ['mom']);
  relations = chooseNpcReply(relations, 'maya', 'friend').state; // +2
  relations = chooseNpcReply(relations, 'jordan', 'note').state; // +1: met, not yet a friend
  const messages = phoneMessages({ ...base, relations });
  assert.ok(messages.some(m => m.id === 'friend:maya:warm' && m.name === 'Maya'));
  const list = contacts(relations);
  assert.equal(list[0].id, 'mom');
  assert.ok(list.some(c => c.id === 'maya' && c.label === 'Friend' && c.where === 'Maple Street'));
  assert.ok(list.some(c => c.id === 'jordan' && c.label === 'Acquaintance'));
  assert.ok(!messages.some(m => m.id.startsWith('friend:jordan')), 'no text from someone you barely know');
  relations = chooseNpcReply(newNpcRelations(), 'maya', 'dismiss').state; // -2
  assert.ok(phoneMessages({ ...base, relations }).some(m => m.id === 'friend:maya:cool'));
  assert.equal(contacts(relations).find(c => c.id === 'maya').label, 'Not on good terms');
});

test('work texts: welcome, today\'s shift hours, and promotions', () => {
  const career = joinCareer(normalizeCareer(null), 'police');
  const messages = phoneMessages({ ...base, career });
  assert.ok(messages.some(m => m.id === 'career:police:welcome' && /06:00 to 22:00/.test(m.text)));
  assert.ok(messages.some(m => m.id === 'career:police:shift:1'));
  const promoted = { ...career, shifts: 50 };
  assert.ok(phoneMessages({ ...base, career: promoted }).some(m => /^career:police:rank:\d+$/.test(m.id) && /Congratulations/.test(m.text)));
  const fire = phoneMessages({ ...base, career: joinCareer(normalizeCareer(null), 'firefighter') });
  assert.ok(fire.some(m => /around the clock/.test(m.text)));
  assert.equal(careerSummary(normalizeCareer(null)).hasJob, false);
  const summary = careerSummary(career);
  assert.ok(summary.hasJob && /Police/i.test(summary.title));
  assert.ok(summary.lines.some(line => /not taken yet/.test(line)));
});

test('threads group by sender; marking read clears the badge', () => {
  const relations = chooseNpcReply(newNpcRelations(), 'maya', 'friend').state;
  const messages = phoneMessages({ ...base, relations, now: { day: 3, minute: 9 * 60 } });
  let { phone } = receiveMessages(newPhone(), messages, { day: 3, minute: 540 });
  const list = threads(phone, messages);
  const mom = list.find(t => t.from === 'mom');
  assert.equal(mom.messages.length, 3);
  assert.equal(mom.unread, 3);
  assert.ok(mom.messages[0].at.day <= mom.messages[2].at.day, 'oldest first inside a thread');
  phone = markRead(phone, mom.messages.map(m => m.id));
  assert.equal(unreadCount(phone, messages), 1, 'Maya still unread');
  assert.equal(markRead(phone, ['nope']), phone);
});

test('saves round-trip, junk is cleaned, and records stay bounded', () => {
  const storage = memory();
  const messages = phoneMessages(base);
  const { phone } = receiveMessages(newPhone(), messages, base.now);
  assert.ok(writePhone('me', phone, storage));
  assert.deepEqual(readPhone('me', storage), phone);
  storage.setItem('tld-phone-v1:bad', '{oops');
  assert.deepEqual(readPhone('bad', storage), newPhone());
  const big = { arrived: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`m${i}`, { day: i + 1, minute: 0 }])), read: ['m0', 'm399', 5] };
  const clean = normalizePhone(big);
  assert.ok(Object.keys(clean.arrived).length <= 160);
  assert.ok(clean.arrived.m399 && !clean.arrived.m0, 'newest kept');
  assert.deepEqual(clean.read, ['m399']);
});
