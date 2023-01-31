/* global chrome */

(function () {
  'use strict'

  // async function storageSet (obj) {
  //  return chrome.storage.local.set(obj)
  // }

  async function storageGet (key) {
    if (key === null) {
      return await chrome.storage.local.get(null)
    }

    return (await chrome.storage.local.get(key))?.[key]
  }

  async function storageRemove (key) {
    return chrome.storage.local.remove(key)
  }

  async function showOptOutStatus (tabId, status, cmp = '') {
    console.log('[AUTOCONSENT / Popup] showOptOutStatus: ' + status + ' / ' + cmp)

    let title = ''

    let openPopup = false

    let icon = 'images/cookie-idle.png'

    if (status === 'success') {
      title = `Opt out successful! (${cmp})`
      icon = 'images/cookie-green.png'
    } else if (status === 'complete') {
      title = `Opt out complete! (${cmp})`
      icon = 'images/cookie-green.png'
    } else if (status === 'working') {
      title = `Processing... (${cmp})`
      icon = 'images/cookie-yellow.png'
    } else if (status === 'verified') {
      title = `Verified (${cmp})`
      icon = 'images/cookie-idle.png'
    } else if (status === 'idle') {
      title = 'Idle'
      icon = 'images/cookie-idle.png'
    } else if (status === 'available') {
      title = `Click to opt out (${cmp})`
      icon = 'images/cookie-green.png'

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

  async function init () {
    // const autoconsentConfig = await storageGet('config')

    const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })

    const tabId = currentTab.id

    const detectedKey = `detected${tabId}`

    console.log('detectedKey', detectedKey)

    const frameId = await storageGet(detectedKey)

    console.log('frameId', frameId, typeof frameId)

    if (typeof frameId === 'number') {
      const acceptAllButton = document.getElementById('action_accept_all')

      acceptAllButton.addEventListener('click', () => {
        storageRemove(detectedKey)
        showOptOutStatus(tabId, 'working')

        chrome.tabs.sendMessage(tabId, {
          type: 'optIn'
        }, {
          frameId
        })

        // window.close();
      })

      const rejectAllButton = document.getElementById('action_reject_all')

      rejectAllButton.addEventListener('click', () => {
        storageRemove(detectedKey)
        showOptOutStatus(tabId, 'working')

        chrome.tabs.sendMessage(tabId, {
          type: 'optOut'
        }, {
          frameId
        })

        // window.close();
      })
    }

    /*
        // set form initial values
        enabledCheckbox.checked = autoconsentConfig.enabled;
        retriesInput.value = autoconsentConfig.detectRetries.toString();
        if (autoconsentConfig.autoAction === 'optIn') {
            optInRadio.checked = true;
        }
        else if (autoconsentConfig.autoAction === 'optOut') {
            optOutRadio.checked = true;
        }
        else {
            promptRadio.checked = true;
        }
        if (autoconsentConfig.enablePrehide) {
            prehideOnRadio.checked = true;
        }
        else {
            prehideOffRadio.checked = true;
        }
        // set form event listeners
        enabledCheckbox.addEventListener('change', () => {
            autoconsentConfig.enabled = enabledCheckbox.checked;
            storageSet({ config: autoconsentConfig });
        });
        retriesInput.addEventListener('change', () => {
            autoconsentConfig.detectRetries = parseInt(retriesInput.value, 10);
            storageSet({ config: autoconsentConfig });
        });
        function modeChange() {
            if (optInRadio.checked) {
                autoconsentConfig.autoAction = 'optIn';
            }
            else if (optOutRadio.checked) {
                autoconsentConfig.autoAction = 'optOut';
            }
            else {
                autoconsentConfig.autoAction = null;
            }
            storageSet({ config: autoconsentConfig });
        }

        optInRadio.addEventListener('change', modeChange);
        optOutRadio.addEventListener('change', modeChange);
        promptRadio.addEventListener('change', modeChange);
        function prehideChange() {
            autoconsentConfig.enablePrehide = prehideOnRadio.checked;
            storageSet({ config: autoconsentConfig });
        }
        prehideOnRadio.addEventListener('change', prehideChange);
        prehideOffRadio.addEventListener('change', prehideChange);

        */
  }
  init()

  console.log('HELLO WORLD')
})()
