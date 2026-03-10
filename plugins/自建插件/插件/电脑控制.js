/**
 * @author YourName
 * @team 工具
 * @name 电脑控制
 * @version 1.0.2
 * @description 远程控制 Windows 电脑：开机(WOL)/关机/重启（使用 SSH 密钥）
 * @rule ^(开机|关机|重启|电脑状态)$
 * @admin false
 * @priority 5000
 * @public false
 * @disable false
 */

const { Client } = require("ssh2");
const dgram = require("dgram");
const fs = require("fs");

// ============ 配置部分 ============

// 允许控制的用户（企业微信 / TG 用户ID）
const ALLOW_USERS = [
  "6a02540394c1803800031e712da9e51b", // 示例：你之前日志里出现过
  "6376232373",
];
// Windows 电脑信息
const PC = {
  mac: "58:11:22:BA:CB:43",   // MAC 地址
  ip: "192.168.124.173",      // Windows 电脑的 IP 地址
  sshUser: "Administrator",    // Windows SSH 登录用户名
  sshPort: 22,                // 默认 SSH 端口
  sshKeyPath: "/root/.ssh/id_ed25519",  // 私钥路径
};

// WOL 广播地址和端口（如果需要启用开机功能）
const WOL_BROADCAST = "192.168.124.255";
const WOL_PORT = 9;

// ============ 工具函数 ============

function getUserId(s) {
  try {
    return (
      s.getUserId?.() ||
      s.getFromId?.() ||
      s.getSender?.()?.id ||
      s.userId ||
      s.from ||
      ""
    ).toString();
  } catch {
    return "";
  }
}

function getMsg(s) {
  try {
    return (s.getMsg?.() || s.msg || s.message?.text || s.text || "").toString().trim();
  } catch {
    return "";
  }
}

function reply(s, text) {
  if (s.sendMsg) return s.sendMsg(text);
  if (s.reply) return s.reply(text);
  return Promise.resolve();
}

// Wake-on-LAN
function sendWOL(mac, ip, port) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    socket.on("error", (err) => {
      try { socket.close(); } catch {}
      reject(err);
    });

    const macClean = mac.replace(/[:-]/g, "").toLowerCase();
    if (macClean.length !== 12) return reject(new Error("MAC 地址格式错误"));

    const macBuf = Buffer.from(macClean, "hex");
    const packet = Buffer.alloc(6 + 16 * 6, 0xff);
    for (let i = 0; i < 16; i++) macBuf.copy(packet, 6 + i * 6);

    socket.bind(() => {
      try { socket.setBroadcast(true); } catch {}
      socket.send(packet, 0, packet.length, port, ip, (err) => {
        try { socket.close(); } catch {}
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

// 通过 SSH 执行命令
function sshExec(cmd) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => {
      conn.exec(cmd, (err, stream) => {
        if (err) {
          reject(err);
        }
        let result = "";
        stream.on("data", (data) => {
          result += data.toString();
        });

        stream.on("close", (code, signal) => {
          conn.end();
          resolve(result);
        });
      });
    }).on("error", (err) => {
      reject(err);
    }).connect({
      host: PC.ip,
      port: PC.sshPort,
      username: PC.sshUser,
      privateKey: fs.readFileSync(PC.sshKeyPath), // 使用私钥文件进行免密登录
    });
  });
}

function pingHost(ip) {
  return new Promise((resolve) => {
    exec(`ping -c 1 -W 1 ${ip}`, (err) => resolve(!err));
  });
}

// ============ 主逻辑 ============

module.exports = async (s) => {
  const msg = getMsg(s);
  const userId = getUserId(s);

  // 确保用户是允许的
  if (!ALLOW_USERS.includes(userId)) {
    await reply(s, "❌ 无权限");
    return;
  }

  try {
    if (msg === "开机") {
      // 更推荐用网段广播：192.168.124.255（很多环境比 255.255.255.255 更稳）
      const broadcast = WOL_BROADCAST;
      await sendWOL(PC.mac, broadcast, WOL_PORT);
      await reply(s, `✅ 已发送开机指令（WOL）\nMAC: ${PC.mac}\n广播: ${broadcast}:${WOL_PORT}`);
      return;
    }

    if (msg === "关机") {
      await reply(s, "⏳ 正在发送关机命令...");
      await sshExec("shutdown /s /t 0");  // Windows 关机命令
      await reply(s, "✅ 关机命令已发送");
      return;
    }

    if (msg === "重启") {
      await reply(s, "⏳ 正在发送重启命令...");
      await sshExec("shutdown /r /t 0");  // Windows 重启命令
      await reply(s, "✅ 重启命令已发送");
      return;
    }

    if (msg === "电脑状态") {
      const ok = await pingHost(PC.ip);
      await reply(s, ok ? `✅ 电脑在线：${PC.ip}` : `❌ 电脑离线：${PC.ip}`);
      return;
    }
  } catch (e) {
    await reply(s, "❌ 执行失败：\n" + (e?.toString?.() || String(e)));
  }
};
