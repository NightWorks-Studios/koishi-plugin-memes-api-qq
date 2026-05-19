import { Context, Time, h } from 'koishi'
import { MemeProperties } from 'meme-generator-rs-api'

import { Config, NewStrategy } from '../config'

export async function apply(ctx: Context, config: Config) {
  const subCmd = ctx.$.cmd.subcommand('.list')

  if (config.enableShortcut) {
    subCmd.alias('表情包制作').alias('表情列表').alias('头像表情包').alias('文字表情包')
  }

  subCmd.action(async ({ session }) => {
    if (!session) return

    const nowTimestamp = new Date().getTime()
    const timeDeltaMs = config.listNewTimeDelta * Time.day

    const properties = {} as Record<string, MemeProperties>
    for (const [key, info] of Object.entries(ctx.$.infos)) {
      const compareTimeStr =
        config.listNewStrategy === NewStrategy.DateCreated
          ? info.date_created
          : info.date_modified
      const compareTimestamp = new Date(compareTimeStr).getTime()
      if (nowTimestamp - compareTimestamp <= timeDeltaMs) {
        ;(properties[key] ??= {}).new = true
      }
    }

    let imgBlob: Blob
    try {
      const keys = await ctx.$.api.getKeys()
      const notExistKeys = keys.filter((x) => !(x in ctx.$.infos))
      const img = await ctx.$.api.renderList({
        exclude_memes: notExistKeys,
        meme_properties: properties,
        sort_by: config.listSortByRs,
        sort_reverse: config.listSortReverse,
        text_template: config.listTextTemplate,
        add_category_icon: config.listAddCategoryIcon,
      })
      imgBlob = await ctx.$.api.getImage(img.image_id)
    } catch (e) {
      return ctx.$.handleError(session, e)
    }

    const buffer = Buffer.from(await imgBlob.arrayBuffer())

    if (session.platform === 'qq' && config.enableQQNativeMarkdown) {
      const allKeys = Object.keys(ctx.$.infos)
      const randomMeme = allKeys[Math.floor(Math.random() * allKeys.length)]
      const title = '表情包列表'
      const mdText = `### 模版列表\n> 共查询到 ${allKeys.length} 种表情包模版。`
      
      const buttons = [
        { id: '1', render_data: { label: '随机生成', visited_label: '随机生成', style: 1 }, action: { type: 2, permission: { type: 2 }, data: '/memes-api.random', enter: true } },
        { id: '2', render_data: { label: '随机详情', visited_label: '随机详情', style: 0 }, action: { type: 2, permission: { type: 2 }, data: `/memes-api.info ${randomMeme}`, enter: true } }
      ]
      
      const sent = await require('../utils/qq-native').sendQQNativeMarkdownAndButtons(ctx, session, config, title, mdText, buttons, buffer)
      if (sent) return
    }

    const msgParams = [h.image(buffer, imgBlob.type)]
    return config.enableShortcut
      ? session.i18n('memes-api.list.tip', msgParams)
      : session.i18n('memes-api.list.tip-no-shortcut', msgParams)
  })
}
