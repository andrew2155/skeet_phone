CreateThread(function()
  -- wait a tick so exports exist
  Wait(500)

  exports['skeet_phone']:RegisterApp({
    id = 'template_app',
    name = 'Template',
    icon = 'icons/app.png',
    resource = GetCurrentResourceName(),

    -- optional default slot suggestion (phone will use if free)
    default = { page = 1, x = 2, y = 1 },

    dockable = true
  })
end)
