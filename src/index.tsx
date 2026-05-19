import type {} from '@koishijs/plugin-help'
import type { Notifier } from '@koishijs/plugin-notifier'
import { Context } from 'koishi'
import { MemeAPI, MemeError, MemeInfo } from 'meme-generator-rs-api'

import * as Commands from './commands'
import { Config } from './config'
import zhCNLocale from './locales/zh-CN.yml'
import * as Utils from './utils'

export { Config }

export const name = 'memes-api-qq'

export const usage = `
<style>
.memes-api-usage {
  background-color: var(--k-side-bg);
  padding: 1px 24px;
  border-radius: 4px;
  border-left: 4px solid var(--k-color-primary);
}

.memes-api-usage a {
  color: var(--k-color-primary-tint);
}

.memes-api-usage a:hover {
  color: var(--primary);
}

.k-comment.success > ul > li:has(a[href^='/commands/memes-api/generate/']) {
  display: none;
}

.k-comment.success > ul > li:has(a[href^='/commands/memes-api/generate'])::after {
  content: '（子命令已隐藏）';
  font-size: 12px;
  color: var(--k-text-normal);
}
</style>

<div class="memes-api-usage">

好消息，memes-api v2 已经初步支持 [meme-generator-rs](https://github.com/MemeCrafters/meme-generator-rs) 🎉  
v2 版本将仅支持 meme-generator-rs，如要使用旧版 meme-generator，请回退到 v1 版本。

查看 [部署文档](https://github.com/MemeCrafters/meme-generator-rs/wiki/%E6%9C%AC%E5%9C%B0%E5%AE%89%E8%A3%85)
或者看看我做的 [视频教程](https://www.bilibili.com/video/BV1hBVsz6EvV/ '关注 LgCookie 喵，关注 LgCookie 谢谢喵') 了解如何部署后端。

目前插件还是处于 可能可以正常使用 的状态，  
如果有 Bug 请积极 [反馈](https://github.com/lgc-KoiDev/koishi-plugin-memes-api/issues)，
[这里](https://github.com/lgc-KoiDev/koishi-plugin-memes-api#-%E9%85%8D%E7%BD%AE--%E4%BD%BF%E7%94%A8) 也有一些暂缓实现的功能，如果真的很想要可以催催我！  
感谢各位的支持与使用~~~！🤗❤️

</div>
`.trim()

export const inject = {
  required: ['http'],
  optional: ['notifier', 'server.temp'],
}

export interface MemePublic {
  get api(): MemeAPI
  get apiVersion(): string
  get infos(): Record<string, MemeInfo>
}
export interface MemeInternal {
  $public: MemePublic
  notifier?: Notifier
  api: MemeAPI
}
declare module 'koishi' {
  interface Context {
    $: MemeInternal
    memesApi: MemePublic
  }
}

export async function apply(ctx: Context, config: Config) {
  ctx.i18n.define('zh-CN', zhCNLocale)
  ctx.i18n.define('zh', zhCNLocale)

  // isolate new context for plugin internal use
  ctx = ctx.isolate('$')
  ctx.set('$', {})

  ctx.$.api = new MemeAPI(ctx.http.extend(config.requestConfig))

  await Utils.apply(ctx, config)

  ctx.inject(['notifier'], () => {
    ctx.$.notifier = ctx.notifier.create()
  })
  ctx.$.notifier?.update({ type: 'primary', content: '插件初始化中……' })

  try {
    await ctx.$.updateInfos()
  } catch (e) {
    ctx.logger.warn('Failed to fetch data from backend, plugin will not work')
    ctx.logger.warn(e)
    const is404 = e instanceof MemeError && e.httpStatus === 404
    ctx.$.notifier?.update({
      type: 'danger',
      content: (
        <p>
          从后端获取相关信息失败，插件将不会工作！
          <br />
          {is404 ? (
            <>
              你或许还没有在使用 meme-generator-rs？请参考插件介绍迁移到
              meme-generator-rs 哦。更多信息请查看日志。
            </>
          ) : (
            <>请检查你的请求设置以及 meme-generator 的部署状态，更多信息请查看日志。</>
          )}
        </p>
      ),
    })
    return
  }

  try {
    await Commands.apply(ctx, config)
    await ctx.$.reRegisterGenerateCommands()
    await ctx.$.refreshShortcuts?.()
  } catch (e) {
    try {
      ctx.$.cmd?.dispose()
    } catch (_) {}
    ctx.logger.warn('Failed to initialize, plugin will not work')
    ctx.logger.warn(e)
    ctx.$.notifier?.update({
      type: 'danger',
      content: (
        <p>
          注册插件指令时出错，插件将不会工作！
          <br />
          更多信息请查看日志。
        </p>
      ),
    })
    return
  }

  ctx.$.$public = {
    get api() {
      return ctx.$.api
    },
    get infos() {
      return ctx.$.infos
    },
    get apiVersion() {
      return ctx.$.apiVersion
    },
  }
  ctx.set('memesApi', ctx.$.$public)

  const memeCount = Object.keys(ctx.$.infos).length
  const minVersion = [0, 2, 2]
  const versionMeets = Utils.isVersionMeets(ctx.$.apiVersion, minVersion)
  ctx.$.notifier?.update({
    type: versionMeets ? 'success' : 'warning',
    content: (
      <p>
        {versionMeets ? (
          <></>
        ) : (
          <>
            警告：后端版本需大于等于 {minVersion.join('.')}
            ，否则插件可能无法正常使用！
            <br />
          </>
        )}
        插件初始化完毕，后端版本 {ctx.$.apiVersion}，共载入 {memeCount} 个表情。
      </p>
    ),
  })
  ctx.logger.info(
    `Plugin initialized successfully` +
      `, backend version ${ctx.$.apiVersion}, loaded ${memeCount} memes`,
  )
}
