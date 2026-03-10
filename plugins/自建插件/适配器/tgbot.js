/**
 * This file is part of the App project.
 * @author Aming
 * @name tgBot
 * @team Bncr团队
 * @version 1.0.4
 * @description tgBot适配器（支持 SOCKS5 / 域名反代）
 * @adapter true
 * @public false
 * @disable false
 * @priority 3
 * @classification ["官方适配器"]
 * @Copyright ©2023
 */

 /* ================= 配置构造器 ================= */

const jsonSchema = BncrCreateSchema.object({
  enable: BncrCreateSchema.boolean()
    .setTitle('是否开启适配器')
    .setDescription('关闭后将不加载 tgBot 适配器')
    .setDefault(false),

  token: BncrCreateSchema.string()
    .setTitle('Telegram Bot Token')
    .setDescription('你的 Telegram Bot API Token')
    .setDefault(''),

  proxyType: BncrCreateSchema.string()
    .setTitle('代理方式')
    .setDescription('none=直连 | reverse=域名反代 | socks5=SOCKS5 代理')
    .setEnum(['none', 'reverse', 'socks5'])
    .setDefault('none'),

  proxyHost: BncrCreateSchema.string()
    .setTitle('Telegram 域名反代')
    .setDescription('仅 proxyType=reverse 时生效，如 https://tg.example.com')
    .setDefault(''),

  socks5Host: BncrCreateSchema.string()
    .setTitle('SOCKS5 主机')
    .setDescription('SOCKS5 代理服务器地址')
    .setDefault('127.0.0.1'),

  socks5Port: BncrCreateSchema.number()
    .setTitle('SOCKS5 端口')
    .setDefault(1080),

  socks5User: BncrCreateSchema.string()
    .setTitle('SOCKS5 用户名')
    .setDefault(''),

  socks5Pass: BncrCreateSchema.string()
    .setTitle('SOCKS5 密码')
    .setDefault('')
});

/* ================= 配置管理器 ================= */

const ConfigDB = new BncrPluginConfig(jsonSchema);

/* ================= 主入口 ================= */

module.exports = async () => {

  /* 读取配置 */
  await ConfigDB.get();

  if (!Object.keys(ConfigDB.userConfig).length) {
    sysMethod.startOutLogs('未配置 tgBot 适配器，退出.');
    return;
  }

  if (!ConfigDB.userConfig.enable) {
    sysMethod.startOutLogs('tgBot 适配器未启用，退出.');
    return;
  }

  /* 补全依赖 */
  await sysMethod.testModule(
    ['node-telegram-bot-api', 'socks-proxy-agent'],
    { install: true }
  );

  const TelegramBot = require('node-telegram-bot-api');
  const { SocksProxyAgent } = require('socks-proxy-agent');

  const Token = ConfigDB.userConfig.token;

  /* ================= Telegram Bot 参数 ================= */

  const opt = { polling: true };

  /* —— 域名反代 —— */
  if (
    ConfigDB.userConfig.proxyType === 'reverse' &&
    ConfigDB.userConfig.proxyHost
  ) {
    opt.baseApiUrl = ConfigDB.userConfig.proxyHost;
    sysMethod.startOutLogs(`tgBot 使用域名反代: ${opt.baseApiUrl}`);
  }

  /* —— SOCKS5 代理 —— */
  if (ConfigDB.userConfig.proxyType === 'socks5') {
    const {
      socks5Host,
      socks5Port,
      socks5User,
      socks5Pass
    } = ConfigDB.userConfig;

    const auth = socks5User
      ? `${encodeURIComponent(socks5User)}:${encodeURIComponent(socks5Pass)}@`
      : '';

    const proxyUrl = `socks5://${auth}${socks5Host}:${socks5Port}`;

    opt.request = {
      agent: new SocksProxyAgent(proxyUrl)
    };

    sysMethod.startOutLogs(`tgBot 使用 SOCKS5 代理: ${socks5Host}:${socks5Port}`);
  }

  /* ================= 启动 Bot ================= */

  const tgBot = new TelegramBot(Token, opt);
  const tg = new Adapter('tgBot');

  /* ================= 发送消息 ================= */

  tg.reply = async function (replyInfo) {
    try {
      const sendId = +replyInfo.groupId || +replyInfo.userId;
      let send;

      switch (replyInfo.type) {
        case 'text':
          send = await tgBot.sendMessage(sendId, replyInfo.msg);
          break;

        case 'image':
          send = await tgBot.sendPhoto(
            sendId,
            replyInfo.path,
            replyInfo.msg ? { caption: replyInfo.msg } : {}
          );
          break;

        case 'video':
          send = await tgBot.sendVideo(sendId, replyInfo.path);
          break;

        case 'audio':
          send = await tgBot.sendAudio(sendId, replyInfo.path, {
            title: replyInfo?.name || '',
            performer: replyInfo?.singer || ''
          });
          break;

        case 'markdown':
          send = await tgBot.sendMessage(sendId, replyInfo.msg, {
            parse_mode: 'Markdown'
          });
          break;

        case 'html':
          send = await tgBot.sendMessage(sendId, replyInfo.msg, {
            parse_mode: 'HTML'
          });
          break;
      }

      return send ? `${send.chat.id}:${send.message_id}` : '0';
    } catch (e) {
      console.error('tgBot 发送消息失败:', e.message);
      return '0';
    }
  };

  /* ================= 推送接口 ================= */

  tg.push = async function (replyInfo) {
    return this.reply(replyInfo);
  };

  /* ================= 删除消息 ================= */

  tg.delMsg = async function (args) {
    try {
      args.forEach(e => {
        if (typeof e === 'string' || typeof e === 'number') {
          const [chatId, msgId] = String(e).split(':');
          tgBot.deleteMessage(chatId, msgId);
        }
      });
      return true;
    } catch (e) {
      console.error('tgBot 删除消息失败:', e);
      return false;
    }
  };

  /* ================= 接收消息 ================= */

  tgBot.on('message', req => {
    try {
      const msgInfo = {
        userId: req.from?.id + '' || '',
        userName: req.from?.username || '',
        groupId: req.chat?.type !== 'private' ? req.chat.id + '' : '0',
        groupName: req.chat?.title || '',
        msg: req.text || '',
        msgId: `${req.chat.id}:${req.message_id}`,
        fromType: 'Social'
      };

      tg.receive(msgInfo);
    } catch (e) {
      console.error('tgBot 接收消息错误:', e);
    }
  });

  tgBot.on('polling_error', e => {
    console.error('tgBot polling 错误:', e.message);
  });

  sysMethod.startOutLogs('tgBot 适配器启动成功');
  return tg;
};
