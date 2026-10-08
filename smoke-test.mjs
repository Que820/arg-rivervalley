
import { JSDOM } from 'jsdom';
import fs from 'fs';

const story = JSON.parse(fs.readFileSync('content/story.json', 'utf8'));
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="arg-root"></div></body></html>', {
  url: 'http://localhost:8090/', runScripts: 'dangerously', pretendToBeVisual: true,
});
const { window } = dom;
window.eval(fs.readFileSync('engine/arg-runtime.js', 'utf8'));
window.ARG_STORY = story;
window.ARG.boot();

const nav = (h) => { window.location.hash = h; window.dispatchEvent(new window.HashChangeEvent('hashchange')); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const has = (t) => window.document.body.textContent.includes(t);
const clues = () => JSON.parse(window.localStorage.getItem('arg-rivervalley-v2')).clues;
const flags = () => JSON.parse(window.localStorage.getItem('arg-rivervalley-v2')).flags;
const clickKw = (label) => [...window.document.querySelectorAll('.kw-inline')].find(w => w.textContent.includes(label))?.click();
const chips = () => [...window.document.querySelectorAll('.combo-chip')];
const link = (t) => [...window.document.querySelectorAll('.link-item a')].find(a => a.textContent.includes(t));
const contact = (t) => [...window.document.querySelectorAll('.contact-item')].find(x => x.textContent.includes(t));
const chatBtn = (t) => [...window.document.querySelectorAll('.chat-choice .btn')].find(b => b.textContent.includes(t));
const ask = async (t) => {
  const input = window.document.querySelector('.chat-input');
  input.value = t;
  [...window.document.querySelectorAll('.chat-input-row .btn')].pop().click();
  await wait(20);
};

await wait(20);
console.log('boot:', has('调查工作台'), '| 远程视角:', has('你不在现场'));

// 门外阶段：只能查钥匙，进不去
nav('#/page/n_room'); await wait(20);
clickKw('钥匙'); await wait(20);
console.log('key clue + enter link:', clues().includes('n_key'), !!link('让罗伦萨进入河谷疗养院'));
link('让罗伦萨进入河谷疗养院').click(); await wait(20);
clickKw('鞋印'); clickKw('合照'); clickKw('书'); clickKw('通讯终端'); clickKw('尸体的状态');
await wait(20);
console.log('indoor clues:', clues().length, '(expect 6)');

// 频道：想法气泡 + 阶段解锁
nav('#/page/n_lls_chat'); await wait(20);
await ask('窗沿的鞋印');
console.log('locked query rejected:', has('还差') && !has('f_told')); // 角色化拒绝回复含人类可读缺失提示，无内部代号泄漏
await ask('现场情况');
console.log('f_told:', flags().f_told === true, '| LLS想法出现:', has('他的想法'));
await ask('鞋印'); await ask('合照上的女人'); await ask('理事会');
console.log('channel clues:', clues().includes('lls_weige') && clues().includes('lls_reply'), '| archive:', flags().f_archive === true);

// 档案库：两卷 + 关键词
nav('#/page/n_index'); await wait(20);
link('打开理事会档案库').click(); await wait(20);
link('T-001').click(); await wait(20);
clickKw('抹除的名字'); await wait(20);
nav('#/page/n_zhuizhi'); await wait(20);
clickKw('木巳的批注'); clickKw('样本编号'); clickKw('「濯枝」'); await wait(20);
console.log('zhuizhi clues:', clues().includes('z_note') && clues().includes('z_code'));

// 组合 → 特蕾莎全真相 + 镜像
nav('#/page/n_desktop'); await wait(20);
chips().find(c => c.textContent.includes('抹除的代号')).click();
chips().find(c => c.textContent.includes('合照')).click();
window.document.querySelector('.combo-btn').click(); await wait(20);
chips().find(c => c.textContent.includes('全真相')).click();
chips().find(c => c.textContent.includes('濯枝')).click();
window.document.querySelector('.combo-btn').click(); await wait(20);
console.log('combos:', has('特蕾莎＝几居') && has('镜像关系'));
nav('#/page/n_desktop'); await wait(20);
console.log('combo compass:', has('组合罗盘') && has('能拼在一起'));
console.log('station combos:', (typeof story !== 'undefined' ? Object.keys(story.combos||{}).length >= 13 || (story.combos||[]).length >= 13 : false));

// 终端：双前置解锁
nav('#/page/n_login'); await wait(20);
const input = window.document.querySelector('.pwd-input');
input.value = 'ST17-0415';
window.document.querySelector('.login-box .btn').click(); await wait(20);
console.log('unlock -> contacts:', has('通讯记录'), '| loginUnlocked:', flags().loginUnlocked === true);

// 通讯记录：单次直接揭示、威胁短信、黑泽、南曲、柳莺
nav('#/page/n_lls_chat'); await wait(20);
await ask('通讯记录');
console.log('ask direct reply:', has('一条不落'));
nav('#/page/n_contacts'); await wait(20);
contact('威胁短信').click(); await wait(20);
chatBtn('回复记录').click();
contact('已删除的会话').click(); await wait(20);
chatBtn('缓存残片').click();
contact('陌生号码').click(); await wait(20);
chatBtn('追溯号码').click(); await wait(20);
contact('黑泽医院').click(); await wait(20);
chatBtn('翻查历史账单').click(); await wait(20);
chatBtn('收件人一栏').click(); await wait(20);
contact('南曲').click(); await wait(20);
chatBtn('南曲相关的档案').click(); await wait(20);
nav('#/page/n_contacts'); await wait(20);
contact('柳莺').click(); await wait(20);
chatBtn('柳莺相关的档案').click(); await wait(20);
console.log('contact clues ok:', clues().includes('n_threat') && clues().includes('heizei_code') && clues().includes('n_nanqu') && clues().includes('n_lingying') && flags().f_cache && flags().f_stranger);

// 嫌疑人逐步出现 + 档案分段
nav('#/page/n_desktop'); await wait(20);
console.log('suspects visible:', [...window.document.querySelectorAll('.suspect')].map(x => x.textContent.trim()).join(','));
nav('#/page/n_lingying'); await wait(20);
console.log('liuying staged (no 旧约 leak):', !has('她受木巳生前之托'));

// 剩余组合 → 全收集
nav('#/page/n_desktop'); await wait(20);
const tryCombo = async (a, b) => {
  chips().find(c => c.textContent.includes(a)).click();
  chips().find(c => c.textContent.includes(b)).click();
  window.document.querySelector('.combo-btn').click();
  await wait(20);
};
await tryCombo('批注', '南曲');
await tryCombo('钥匙', '鞋印');
await tryCombo('缴费记录', '柳莺');
await tryCombo('威胁短信', '样本编号');
console.log('all clues:', clues().length, '/', Object.keys(story.clues).length, '| f_death:', flags().f_death === true);

// 新环节：修复室 / 通风管 / 温室 / 磁带
nav('#/page/n_restorer'); await wait(20);
console.log('restorer reveals Jiu Ju:', has('「几居」'));
nav('#/page/n_vents'); await wait(20);
clickKw('数据卷轴'); await wait(20);
// 温室：定时器校准玩法（拨到 05:00）
nav('#/page/n_garden'); await wait(20);
const clockBtns = () => [...window.document.querySelectorAll('.puzzle-clock .dial-btn')];
for (let i = 0; i < 5; i++) clockBtns()[0].click(); await wait(20); // 小时 0 -> 5
[...window.document.querySelectorAll('.puzzle-box .btn')].pop().click(); await wait(20);
console.log('timer puzzle solved:', !!window.document.querySelector('.puzzle-box.solved'));
// 磁带：频率调谐玩法（17.4 MHz = 174 档）
nav('#/page/n_tape'); await wait(20);
const rng = window.document.querySelector('.puzzle-range');
rng.value = 174; rng.dispatchEvent(new window.Event('input')); await wait(20);
[...window.document.querySelectorAll('.puzzle-box .btn')].pop().click(); await wait(20);
console.log('tape puzzle solved:', !!window.document.querySelector('.puzzle-box.solved'));
nav('#/page/n_desktop'); await wait(20);
await tryCombo('录音带', '登记条上的样本名');
window.document.querySelector('.combo-btn').click(); await wait(20);

// 雨幕车站大环节：候车大厅 → 病房 → 洗涤间/图书馆 → 站台 + 尾鸲频道 + 孩子们的旧约
nav('#/page/n_station'); await wait(20);
clickKw('售票窗口'); clickKw('绳结扣'); await wait(20);
// 芯片阵列：转盘 0415
const dials = () => [...window.document.querySelectorAll('.puzzle-dials .puzzle-dial')];
const upN = (dialIdx, times) => { for (let t = 0; t < times; t++) dials()[dialIdx].querySelector('.dial-btn').click(); };
upN(0, 0); upN(1, 4); upN(2, 1); upN(3, 5); await wait(20);
[...window.document.querySelectorAll('.puzzle-box .btn')].pop().click(); await wait(20);
console.log('chips puzzle solved:', !!window.document.querySelector('.puzzle-box.solved'));
link('记忆回廊').click(); await wait(20);
// 病房：记忆碎片排序（按 0,1,2,3,4 顺序点击残像）
const frags = () => [...window.document.querySelectorAll('.puzzle-frag')];
const tags = ['残像一','残像二','残像三','残像四','残像五'];
for (let k = 0; k < 5; k++) { frags().find(f=>f.textContent.includes(tags[k])).click(); await wait(5); } await wait(20);
console.log('memory puzzle solved:', !!window.document.querySelector('.puzzle-box.solved'));
link('洗涤间').click(); await wait(20);
clickKw('「别信白大衣说的话。」'); await wait(20);
nav('#/page/n_vault'); await wait(20);
clickKw('没有瞳孔'); await wait(20);
nav('#/page/n_platform'); await wait(20);
clickKw('车票'); clickKw('金属片'); await wait(20);
nav('#/page/n_contacts'); await wait(20);
contact('尾鸲').click(); await wait(20);
chatBtn('异地上传日志').click(); await wait(20);
nav('#/page/n_desktop'); await wait(20);
await tryCombo('方糖纸', '无瞳之眼');
console.log('station chapter:', clues().includes('st_metal') && clues().includes('st_tail') && flags().f_kids === true);
nav('#/page/n_desktop'); await wait(20);
{const btns=[...window.document.querySelectorAll('.combo-chip')];const byTxt=(t)=>btns.find(b=>b.textContent.includes(t));byTxt('幽灵少女') && byTxt('人格剥离截断数据') && (byTxt('幽灵少女').click(),byTxt('人格剥离截断数据').click());await wait(20);const tryBtn=[...window.document.querySelectorAll('.combo-btn')][0];if(tryBtn){tryBtn.click();await wait(20);}}
console.log('c_face combo:', has('站台上的脸') || has('被同一场雨模糊的脸'), '| f_face:', flags().f_face === true);

// 罗伦萨通讯 → 汇报 → 真相档案库 → 隐藏判词
nav('#/page/n_contacts'); await wait(20);
contact('罗伦萨').click(); await wait(20);
chatBtn('翻看与罗伦萨').click(); await wait(20);          // 拒绝1
chatBtn('再试一次').click(); await wait(20);              // 拒绝2
chatBtn('南曲的档案里').click(); await wait(20);          // 第三次：同意，解锁记录
console.log('lls unlock:', flags().f_lls_ok === true, '| 记录含几居警告:', has('一切都好'));
chatBtn('汇报').click(); await wait(20);
console.log('truth page:', has('真相档案库'));
nav('#/page/n_final_chat'); await wait(20);
const vBtns=[...window.document.querySelectorAll('button')].filter(b=>b.textContent.includes('指认'));
console.log('verdict buttons:', vBtns.length, '| new endings wired:', ['罗伦萨','木槭','旧尾花'].every(n=>vBtns.some(b=>b.textContent.includes(n))));
const hiddenBtn = [...window.document.querySelectorAll('button')].find(b => b.textContent.includes('隐藏判词'));
console.log('hidden enabled:', hiddenBtn && !hiddenBtn.disabled);
hiddenBtn && hiddenBtn.click(); await wait(20);
console.log('true ending:', has('她还在'));
console.log('new chapters all collected:', clues().length === Object.keys(story.clues).length, '| f_seed:', flags().f_seed === true);

// 低进度结局可达性：独立速通脚本（全新 JSDOM，跳过柳莺线与新环节，20 条线索以下指认特因）
import { execSync } from 'node:child_process';
try {
  const out = execSync(JSON.stringify(process.execPath) + ' rush-test.mjs', { encoding: 'utf8' });
  console.log(out.trim().split('\n').pop());
} catch (e) {
  console.log((e.stdout || '').trim().split('\n').pop() || 'low-progress end1 reachable: false');
  process.exit(1);
}
console.log('SMOKE DONE');
