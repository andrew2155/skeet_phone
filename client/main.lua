local QBCore = exports['qb-core']:GetCoreObject()

local PhoneOpen = false
local Profile = nil
local UiReady = false

local PendingApps = {}
local Registry = { apps = {}, widgets = {} }

local function sendUI(action, data)
  SendNUIMessage({ action = action, data = data })
end

local function setPhoneOpen(state)
  PhoneOpen = state

  if state then
    SetNuiFocus(true, true)
    SetNuiFocusKeepInput(true)
    sendUI('open', {
      config = {
        gridCols = Config.GridCols,
        gridRows = Config.GridRows,
        dockSlots = Config.DockSlots,
        enableSwipe = Config.EnableSwipe,
        swipeThreshold = Config.SwipeThresholdPx,
        minUiScale = Config.MinUiScale,
        maxUiScale = Config.MaxUiScale,
        builtInWallpapers = Config.BuiltInWallpapers,
        frameColors = Config.FrameColors,
        homeReturnAlwaysPage1 = Config.HomeReturnAlwaysPage1
      },
      profile = Profile,
      registry = Registry
    })
  else
    SetNuiFocus(false, false)
    SetNuiFocusKeepInput(false)
    sendUI('close', {})
  end
end

local function controlsLoop()
  CreateThread(function()
    while true do
      if PhoneOpen and Config.BlockControls then
        -- hard lock gameplay inputs while UI is open
        DisableAllControlActions(0)

        -- allow only what the UI needs (mouse + ESC)
        EnableControlAction(0, 322, true) -- ESC
        EnableControlAction(0, 200, true) -- ESC/pause back (some setups)
        EnableControlAction(0, 245, true) -- chat (optional)
      end
      Wait(0)
    end
  end)
end

controlsLoop()

local function loadProfileAndOpen()
  QBCore.Functions.TriggerCallback('skeet_phone:server:getProfile', function(profile)
    Profile = profile
    setPhoneOpen(true)
  end)
end

RegisterCommand('skeet_phone_toggle', function()
  if PhoneOpen then
    setPhoneOpen(false)
    return
  end

  QBCore.Functions.TriggerCallback('skeet_phone:server:canOpen', function(canOpen)
    if not canOpen then
      QBCore.Functions.Notify('You need a phone.', 'error')
      return
    end
    loadProfileAndOpen()
  end)
end, false)

RegisterKeyMapping('skeet_phone_toggle', 'Open Phone', 'keyboard', Config.OpenKey)

-- NUI callbacks
RegisterNUICallback('uiReady', function(_, cb)
  UiReady = true

  -- push pending app registrations
  for _, p in ipairs(PendingApps) do
    if p.kind == 'app' then
      Registry.apps[p.meta.id] = p.meta
      sendUI('registerApp', p.meta)
    else
      Registry.widgets[p.meta.id] = p.meta
      sendUI('registerWidget', p.meta)
    end
  end
  PendingApps = {}

  cb(true)
end)

RegisterNUICallback('closePhone', function(_, cb)
  setPhoneOpen(false)
  cb(true)
end)

RegisterNUICallback('saveProfile', function(payload, cb)
  -- payload: { frameColor, wallpaper:{type,value}, uiScale, layout, dock }
  Profile.frameColor = payload.frameColor
  Profile.wallpaper = payload.wallpaper
  Profile.uiScale = payload.uiScale
  Profile.layout = payload.layout
  Profile.dock = payload.dock

  TriggerServerEvent('skeet_phone:server:saveProfile', payload)
  cb(true)
end)

RegisterNUICallback('requestProfile', function(_, cb)
  if Profile then cb(Profile) else cb(nil) end
end)

-- ========= Exports for standalone apps/widgets =========
exports('RegisterApp', function(appMeta)
  if type(appMeta) ~= 'table' or not appMeta.id then return false end
  Registry.apps[appMeta.id] = appMeta

  if UiReady then
    sendUI('registerApp', appMeta)
  else
    PendingApps[#PendingApps+1] = { kind = 'app', meta = appMeta }
  end

  return true
end)

exports('RegisterWidget', function(widgetMeta)
  if type(widgetMeta) ~= 'table' or not widgetMeta.id then return false end
  Registry.widgets[widgetMeta.id] = widgetMeta

  if UiReady then
    sendUI('registerWidget', widgetMeta)
  else
    PendingApps[#PendingApps+1] = { kind = 'widget', meta = widgetMeta }
  end

  return true
end)
