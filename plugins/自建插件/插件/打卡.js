/**
 * @author YourName
 * @team 工具
 * @name 打卡
 * @version 2.4.0
 * @description 多用户 + 配置文件 + 强制获取真实消息
 * @rule ^(打卡[12]?|时间|状态|z|d|打卡Z|cld|clz|jtz|jtd|pz)$
 * @admin false
 * @priority 5000
 * @public false
 * @systemVersion >=:3.0.0
 * @authentication false
 * @classification ["工具"]
 * @encrypt true
 * @disable false
 */

const { Client } = require('ssh2');
const fs = require('fs-extra');
const path = require('path');

module.exports = async (s) => {
  const log = (m) => console.log(`[打卡插件] ${new Date().toISOString()} | ${m}`);
  const send = async (text) => {
    try {
      if (s.sendMsg) await s.sendMsg(text);
      else if (s.reply) await s.reply(text);
    } catch (e) {
      log(`发送失败: ${e.message}`);
    }
  };

  // ============ 强制获取真实消息 ============
  let msg = '';
  try {
    msg = s.getMsg?.() || s.msg || s.message?.text || s.text || '';
    msg = msg.toString().trim();
  } catch (e) {
    msg = '';
  }
  log(`真实消息: "${msg}"`);

// ============ 获取用户 ID ============
let userId = '';
try {
  userId =
    s.getUserId?.() ||
    s.getFromId?.() ||
    s.getSender?.()?.id ||
    s.userId || s.from || s.senderId || '';   // 兼容不同适配器字段

  userId = String(userId).trim();

  // 如果是像 "wxWork/0@DouXueFeng" 这种格式，取 @ 后面的
  const at = userId.match(/@(.+)$/);
  if (at) userId = at[1];

  // 如果你仍然想兼容“纯数字”，保留数字提取作为兜底，而不是强制
  // const num = userId.match(/\d+/)?.[0];
  // if (num && num.length === userId.length) userId = num;
} catch (e) {}
log(`用户 ID: ${userId || '未知'}`);


  // ============ 读取配置 ============
  const configPath = path.join(__dirname, '打卡配置.json');
  let config = { users: [], commands: {} };
  try {
    config = await fs.readJson(configPath);
  } catch (e) {
    await send('Error: 配置加载失败');
    return;
  }

  // ============ 权限检查 ============
  if (!config.users.includes(userId)) {
    log(`无权限: ${userId}`);
    return;
  }

  // ============ 命令映射 ============
  const commandMap = {
    "打卡": config.commands["打卡1"],
    "打卡1": config.commands["打卡1"],
    "打卡2": config.commands["打卡2"],
    "打卡Z": config.commands["打卡Z"],
    "z": config.commands["z"],
    "时间": config.commands["时间"],
    "cld": config.commands["cld"],
    "clz": config.commands["clz"],
    "d": config.commands["d"],
    "jtz": config.commands["jtz"],
    "jtd": config.commands["jtd"],
    "pz": config.commands["pz"],
    "状态": config.commands["状态"]
  };

  let command = null;
  if (msg === "打卡" || msg === "打卡1") command = commandMap["打卡1"];
  else if (msg === "打卡2") command = commandMap["打卡2"];
  else if (msg === "打卡Z") command = commandMap["打卡Z"];
  else if (msg === "jtz") command = commandMap["jtz"];
  else if (msg === "jtd") command = commandMap["jtd"];
  else if (msg === "z") command = commandMap["z"];
  else if (msg === "时间") command = commandMap["时间"];
  else if (msg === "cld") command = commandMap["cld"];
  else if (msg === "d") command = commandMap["d"];
  else if (msg === "clz") command = commandMap["clz"];
  else if (msg === "pz") command = commandMap["pz"];
  else if (msg === "状态") command = commandMap["状态"];

  if (!command) {
    log('无匹配命令');
    return;
  }
  log(`执行: ${command}`);

  // ============ SSH 执行 ============
  const HOST = '192.168.31.234';
  const PORT = 22;
  const USERNAME = 'root';
  const KEY_FILE = '/root/.ssh/id_ed25519';

  let privateKey;
  try {
    privateKey = await fs.readFile(path.resolve(KEY_FILE));
  } catch (e) {
    await send('Error: 私钥失败');
    return;
  }

  const conn = new Client();
  return new Promise((resolve) => {
    conn.on('ready', async () => {
      await send(`Success: 执行中...\n\`\`\`${command}\`\`\``);

      conn.exec(command, (err, stream) => {
        if (err) { send('Error: 启动失败'); conn.end(); return resolve(); }

        let out = '', errout = '';
        stream.on('data', d => { out += d; log(`[OUT] ${d}`); })
              .stderr.on('data', d => { errout += d; log(`[ERR] ${d}`); })
              .on('close', async (code) => {
                const res = `Success: 完成（${code}）\n${out ? '=== 输出 ===\n' + out.trim() : ''}${errout ? '=== 错误 ===\n' + errout.trim() : ''}`;
                await send(res);
                conn.end();
                resolve();
              });
      });
    })
    .on('error', async () => { await send('Error: SSH 失败'); resolve(); })
    .connect({ host: HOST, port: PORT, username: USERNAME, privateKey });
  });
};