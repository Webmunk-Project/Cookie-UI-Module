/* eslint-disable no-eval */
/* global chrome, registerCustomModule, crypto */

(function () {
  'use strict'

  async function storageSet (obj) {
    return chrome.storage.local.set(obj)
  }

  async function storageGet (key) {
    if (key === null) {
      return await chrome.storage.local.get(null)
    }

    return (await chrome.storage.local.get(key))?.[key]
  }

  async function storageRemove (key) {
    return chrome.storage.local.remove(key)
  }

  /** TODO: Change to show pop-up in-page **/

  async function showOptOutStatus (tabId, status, cmp = '') {
    console.log('[Uniform Cookie UI] showOptOutStatus: ' + status + ' / ' + cmp)

    let title = ''

    let icon = '../modules/cookie-ui/images/cookie-idle.png'

    if (status === 'success') {
      title = `Opt out successful! (${cmp})`
      icon = '../modules/cookie-ui/images/cookie-green.png'
    } else if (status === 'complete') {
      title = `Opt out complete! (${cmp})`
      icon = '../modules/cookie-ui/images/cookie-green.png'
    } else if (status === 'working') {
      title = `Processing... (${cmp})`
      icon = '../modules/cookie-ui/images/cookie-yellow.png'
    } else if (status === 'verified') {
      title = `Verified (${cmp})`
      icon = '../modules/cookie-ui/images/cookie-idle.png'
    } else if (status === 'idle') {
      title = 'Idle'
      icon = '../modules/cookie-ui/images/cookie-idle.png'
    } else if (status === 'available') {
      title = `Click to opt out (${cmp})`
      icon = '../modules/cookie-ui/images/cookie-green.png'
    }

    await chrome.action.setTitle({
      tabId,
      title
    })

    await chrome.action.setIcon({
      tabId,
      path: icon
    })
  }

  async function loadRules () {
    const res = await fetch('../modules/cookie-ui/js/rules.json')
    storageSet({
      rules: await res.json()
    })
  }

  async function initConfig () {
    const storedConfig = await storageGet('config')
    if (!storedConfig) {
      const defaultConfig = {
        enabled: true,
        autoAction: 'doNothing', // 'optOut',
        disabledCmps: [],
        enablePrehide: true,
        detectRetries: 20
      }
      await storageSet({
        config: defaultConfig
      })
    }
  }

  async function evalInTab (tabId, frameId, code) {
    return chrome.scripting.executeScript({
      target: {
        tabId,
        frameIds: [frameId]
      },
      world: 'MAIN',
      args: [code],
      func: (code) => {
        try {
          return window.eval(code)
        } catch (e) {
          // ignore CSP errors
          console.warn('eval error', code, e)
        }
      }
    })
  }

  chrome.runtime.onInstalled.addListener(() => {
    loadRules()
    initConfig()
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    storageRemove(`detected${tabId}`)
  })

  chrome.runtime.onMessage.addListener(async (msg, sender) => {
    const tabId = sender.tab.id

    if (msg.content === 'cookie_ui_insert_css') {
      console.log('[Uniform Cookie UI] Insert CSS...')

      let css = '.cookie-ui-accept-all { border: 10px solid #43A047 !important; }\n'
      css += '.cookie-ui-reject-all { border: 10px solid #D32F2F !important; }\n'
      css += '.cookie-ui-accept-some { border: 10px solid #039BE5 !important; }\n'
      css += '.cookie-ui-settings { border: 10px solid #FFFF00 !important; }\n'

      css += '#uniform_cookie_ui { z-index: 2147483647 !important; position: fixed; }\n'

      chrome.scripting.insertCSS({
        target: {
          tabId: tabId, // eslint-disable-line object-shorthand
          allFrames: true
        },
        css: css, // eslint-disable-line object-shorthand
        origin: 'USER'
      }, function () {
      })

      return true
    }

    if (msg.type === undefined) {
      return false
    }

    const frameId = sender.frameId
    const rules = await storageGet('rules')
    const autoconsentConfig = await storageGet('config')

    // console.log('[Cookie UI] MESSAGE: ', msg)

    switch (msg.type) {
      case 'init':
        if (frameId === 0) {
          await showOptOutStatus(tabId, 'idle')
        }

        chrome.storage.local.get({ 'pdk-identifier': '' }, async function (result) {
          let userIdentifier = 'unknown'

          if (result['pdk-identifier'] !== '') {
            userIdentifier = result['pdk-identifier']
          }

          console.log('[Uniform Cookie UI] Found ID: ' + userIdentifier)

          autoconsentConfig.webmunkUserId = userIdentifier
          autoconsentConfig.webmunkURL = msg.url

          const url = new URL(msg.url)

          const urlUserString = userIdentifier + ' @ ' + url.hostname

          const encoder = new TextEncoder()
          const data = encoder.encode(urlUserString)

          const hashBuffer = await crypto.subtle.digest('SHA-256', data)

          const hashArray = Array.from(new Uint8Array(hashBuffer)) // convert buffer to byte array

          let hashSum = 0

          hashArray.forEach(function (item) {
            hashSum += item
          })

          const webmunkConditions = [
            'settings-accept',
            'settings-reject',
            'settings-accept-reject',
            'reject-accept-settings',
            'accept-reject-settings',
            'accept-reject-monosettings',
            'organic'
          ]

          const selectedIndex = hashSum % webmunkConditions.length

          autoconsentConfig.webmunkCondition = webmunkConditions[selectedIndex]

          console.log('[Uniform Cookie UI] Selected condition: ' + autoconsentConfig.webmunkCondition + ' for ' + urlUserString)

          chrome.tabs.sendMessage(tabId, {
            type: 'initResp',
            rules,
            config: autoconsentConfig
          }, {
            frameId
          })
        })
        break
      case 'eval':
        //          console.log('[AUTOCONSENT] EVAL in ' + tabId + '/' + frameId)
        //          console.log(msg.code)

        evalInTab(tabId, frameId, msg.code).then(([result]) => {
          //            console.log('[AUTOCONSENT] EVALED:')
          //            console.log(result)

          chrome.tabs.sendMessage(tabId, {
            id: msg.id,
            type: 'evalResp',
            result: result.result
          }, {
            frameId
          })
        })
        break
      case 'popupFound':
        await showOptOutStatus(tabId, 'available', msg.cmp)

        storageSet({
          [`detected${tabId}`]: frameId
        })

        chrome.tabs.sendMessage(tabId, {
          type: 'showUniformInterface',
          rules,
          config: autoconsentConfig
        }, {
          frameId
        })

        break
      case 'optOutResult':
      case 'optInResult':
        console.log('[Uniform Cookie UI] optInResult/optOutResult: ' + msg.type)

        if (msg.result) {
          await showOptOutStatus(tabId, 'working', msg.cmp)
          if (msg.scheduleSelfTest) {
            await storageSet({
              [`selfTest${tabId}`]: frameId
            })
          }
        }
        break
      case 'selfTestResult':
        if (msg.result) {
          await showOptOutStatus(tabId, 'verified', msg.cmp)
        }
        break
      case 'autoconsentDone': {
        await showOptOutStatus(tabId, 'success', msg.cmp)
        // sometimes self-test needs to be done in another frame
        const selfTestKey = `selfTest${tabId}`
        const selfTestFrameId = (await chrome.storage.local.get(selfTestKey))?.[selfTestKey]
        if (typeof selfTestFrameId === 'number') {
          storageRemove(selfTestKey)
          chrome.tabs.sendMessage(tabId, {
            type: 'selfTest'
          }, {
            frameId: selfTestFrameId
          })
        }
        break
      }
      case 'autoconsentError':
        console.error('Error:', msg.details)
        break
    }
  })

  registerCustomModule(function (config) {
    console.log('[Uniform Cookie UI] Service worker initialized.')
  })
})()
