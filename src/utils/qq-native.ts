import { Context, Session, h } from 'koishi'
import { Config } from '../config'

export interface Button {
  id: string
  render_data: {
    label: string
    visited_label: string
    style: number
  }
  action: {
    type: number
    permission: { type: number }
    data: string
    reply?: boolean
    enter: boolean
  }
}

interface QQSendMessageRequest {
  content: string
  msg_type: 2
  msg_id?: string
  msg_seq?: number
  markdown: { content: string }
  keyboard?: any
}

interface QQSessionBridge {
  sendMessage(channelId: string, data: QQSendMessageRequest): Promise<unknown>
  sendPrivateMessage(openid: string, data: QQSendMessageRequest): Promise<unknown>
}

function getImageSize(buffer: Buffer) {
  let imgW = 0, imgH = 0
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    imgW = buffer.readUInt32BE(16)
    imgH = buffer.readUInt32BE(20)
  } else if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break
      while (buffer[offset] === 0xff) offset++
      const marker = buffer[offset]
      offset++
      if (marker === 0xda || marker === 0xd9) break
      const length = buffer.readUInt16BE(offset)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        imgH = buffer.readUInt16BE(offset + 3)
        imgW = buffer.readUInt16BE(offset + 5)
        break
      }
      offset += length
    }
  } else if (buffer.length >= 10 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    imgW = buffer.readUInt16LE(6)
    imgH = buffer.readUInt16LE(8)
  } else if (buffer.length >= 30 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    const chunkType = buffer.toString('utf8', 12, 16)
    if (chunkType === 'VP8 ') {
      imgW = buffer.readUInt16LE(26) & 0x3fff
      imgH = buffer.readUInt16LE(28) & 0x3fff
    } else if (chunkType === 'VP8L') {
      const b1 = buffer[21], b2 = buffer[22], b3 = buffer[23], b4 = buffer[24]
      imgW = 1 + (((b2 & 0x3F) << 8) | b1)
      imgH = 1 + (((b4 & 0xF) << 10) | (b3 << 2) | ((b2 & 0xC0) >> 6))
    } else if (chunkType === 'VP8X') {
      imgW = 1 + buffer.readUIntLE(24, 3)
      imgH = 1 + buffer.readUIntLE(27, 3)
    }
  }
  return { w: imgW || 500, h: imgH || 500 }
}

export async function sendQQNativeMarkdownAndButtons(
  ctx: Context,
  session: Session,
  config: Config,
  title: string,
  mdText: string,
  buttons: Button[] = [],
  imageBuffer?: Buffer
): Promise<boolean> {
  if (session.platform !== 'qq' || !config.enableQQNativeMarkdown) {
    return false
  }

  let tempUrl = ''
  if (imageBuffer) {
    const tempService = (ctx as any).server?.temp || (ctx as any)['server.temp']
    if (tempService) {
      try {
        const entry = await tempService.create(imageBuffer)
        tempUrl = entry.url
      } catch (e) {
        ctx.logger('memes-api-qq').warn('Failed to upload image to server-temp:', e)
      }
    }
  }

  // 如果得不到临时 url (意味着图文混合失败)，则单独发送一张图
  if (imageBuffer && !tempUrl) {
    await session.send(h.image(imageBuffer, 'image/png'))
  }

  let finalMdText = mdText
  if (tempUrl && imageBuffer) {
    const size = getImageSize(imageBuffer)
    // 插入临时图片到最上面
    finalMdText = `![预览 #${size.w}px #${size.h}px](${tempUrl})\n` + finalMdText
  }

  let keyboard
  if (config.enableQQInteractiveButtons && buttons.length) {
    keyboard = {
      content: {
        rows: []
      }
    }
    // 把按钮3个一组放入 row
    let currentRow = []
    for (const btn of buttons) {
      currentRow.push(btn)
      if (currentRow.length === 3) {
        keyboard.content.rows.push({ buttons: currentRow })
        currentRow = []
      }
    }
    if (currentRow.length > 0) {
      keyboard.content.rows.push({ buttons: currentRow })
    }
  }

  session['seq'] = session['seq'] || 0
  const msgSeq = ++session['seq']

  const payload: QQSendMessageRequest = {
    content: title,
    msg_type: 2,
    msg_id: session.messageId,
    msg_seq: msgSeq,
    markdown: { content: finalMdText },
    keyboard
  }

  try {
    const internal = session.bot?.internal as QQSessionBridge | undefined
    if (!internal) return false

    if (session.isDirect) {
      await internal.sendPrivateMessage(session.channelId, payload)
    } else {
      await internal.sendMessage(session.channelId, payload)
    }
    return true
  } catch (e: any) {
    ctx.logger('memes-api-qq').warn('QQ native markdown send failed:', e.response?.data || e.message || e)
    return false
  }
}
