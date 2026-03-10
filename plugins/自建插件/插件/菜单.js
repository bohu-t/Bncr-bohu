/**
 * @author you
 * @name 菜单
 * @team 工具
 * @version 1.0.0
 * @description 发送“菜单”返回自定义命令简介
 * @rule ^(菜单|help|命令)$
 * @admin false
 * @priority 5000
 * @public false
 * @disable false
 */

const fs = require("fs-extra");
const path = require("path");

module.exports = async (s) => {
  // 统一回复函数
  const reply = async (text) => {
    if (s.sendMsg) return s.sendMsg(text);
    if (s.reply) return s.reply(text);
  };

  // 读取配置（你自己定义菜单内容）
  const cfgPath = path.join(__dirname, "菜单配置.json");
  let cfg;
  try {
    cfg = await fs.readJson(cfgPath);
  } catch (e) {
    return reply("菜单配置加载失败：请检查 plugins/菜单配置.json 是否存在且为合法 JSON");
  }

  // 获取“平台/群/用户”（可用于做差异化菜单）
  const platform =
    (typeof s.getPlatform === "function" ? s.getPlatform() : "") ||
    s.platform ||
    "";

  const userId =
    (typeof s.getUserId === "function" ? s.getUserId() : "") ||
    (typeof s.getFromId === "function" ? s.getFromId() : "") ||
    (s.getSender && typeof s.getSender === "function" && s.getSender()?.id) ||
    s.userId ||
    s.from ||
    s.senderId ||
    "";

  const groupId =
    (typeof s.getGroupId === "function" ? s.getGroupId() : "") ||
    (typeof s.getChatId === "function" ? s.getChatId() : "") ||
    s.groupId ||
    s.roomId ||
    "";

  // 允许白名单（可选）
  if (Array.isArray(cfg.allowUsers) && cfg.allowUsers.length) {
    if (!cfg.allowUsers.includes(String(userId))) {
      return; // 静默
    }
  }

  // 选择菜单：支持 platformMenus / groupMenus / 默认菜单
  let menu = cfg.menu || [];
  if (cfg.platformMenus && platform && cfg.platformMenus[platform]) {
    menu = cfg.platformMenus[platform];
  }
  if (cfg.groupMenus && groupId && cfg.groupMenus[String(groupId)]) {
    menu = cfg.groupMenus[String(groupId)];
  }

  // 组装输出
  const title = cfg.title || "命令菜单";
  const footer = cfg.footer || "";

  const lines = [];
  lines.push(`【${title}】`);
  lines.push("");

  for (const item of menu) {
    // item: { cmd, desc, example, note }
    if (!item || !item.cmd) continue;
    const desc = item.desc ? `：${item.desc}` : "";
    lines.push(`- ${item.cmd}${desc}`);
    if (item.example) lines.push(`  示例：${item.example}`);
    if (item.note) lines.push(`  备注：${item.note}`);
  }

  if (footer) {
    lines.push("");
    lines.push(footer);
  }

  // 企业微信等平台对长度敏感：太长就分段
  const msg = lines.join("\n");
  const maxLen = cfg.maxLen || 1800;

  if (msg.length <= maxLen) return reply(msg);

  // 分段发送
  for (let i = 0; i < msg.length; i += maxLen) {
    await reply(msg.slice(i, i + maxLen));
  }
};
