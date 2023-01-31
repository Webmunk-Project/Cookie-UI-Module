/* eslint-disable no-eval */
/* global chrome, registerCustomModule */

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
    console.log('[AUTOCONSENT/WORKER] showOptOutStatus: ' + status + ' / ' + cmp)

    let title = ''

    let openPopup = false

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

      openPopup = true
    }

    console.log('ACTION: ')
    console.log(chrome.action)

    await chrome.action.setTitle({
      tabId,
      title
    })

    await chrome.action.setIcon({
      tabId,
      path: icon
    })

    if (openPopup && chrome.action.openPopup !== undefined) {
      chrome.action.openPopup()
    }
  }

  async function loadRules () {
    const res = await fetch('../modules/cookie-ui/js/rules.json')
    storageSet({
      rules: await res.json()
    })
  }

  async function initConfig () {
    console.log('init sw')
    const storedConfig = await storageGet('config')
    console.log('storedConfig', storedConfig)
    if (!storedConfig) {
      console.log('init config')
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
    if (msg.type === undefined) {
      return false
    }

    const tabId = sender.tab.id
    const frameId = sender.frameId
    const rules = await storageGet('rules')
    const autoconsentConfig = await storageGet('config')

    console.log('[Cookie UI] MESSAGE: ', msg)

    switch (msg.type) {
      case 'init':
        if (frameId === 0) {
          await showOptOutStatus(tabId, 'idle')
        }
        chrome.tabs.sendMessage(tabId, {
          type: 'initResp',
          rules,
          config: autoconsentConfig
        }, {
          frameId
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
        console.log('WORKER optInResult/optOutResult: ' + msg.type)

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
