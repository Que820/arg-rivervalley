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
clickKw('木巳的批注'); clickKw('样本编号'); await wait(20);
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

// 终端：双前置解锁
nav('#/page/n_login'); await wait(20);
const input = window.document.querySelector('.pwd-input');
input.value = 'ST17-0415';
window.document.querySelector('.login-box .btn').click(); await wait(20);
console.log('unlock -> contacts:', has('通讯记录'), '| loginUnlocked:', flags().loginUnlocked === true);

// 通讯记录：威胁短信（需 ask2）、黑泽、南曲、柳莺
nav('#/page/n_lls_chat'); await wait(20);
await ask('通讯记录');
console.log('ask1 refused:', has('无可奉告'));
await ask('再问一次');
console.log('ask2 reply:', has('一条不落'));
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
const hiddenBtn = [...window.document.querySelectorAll('button')].find(b => b.textContent.includes('隐藏判词'));
console.log('hidden enabled:', hiddenBtn && !hiddenBtn.disabled);
hiddenBtn.click(); await wait(20);
console.log('true ending:', has('她还在'));
console.log('SMOKE DONE');
