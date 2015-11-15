'use strict';

angular.module('copayApp.services').factory('themeService', function($rootScope, $log, $http, $timeout, $q, themeCatalogService, lodash, notification, gettext, brand) {

  // The $rootScope is used to track theme and skin objects.  Views reference $rootScope for rendering.
  // 
  // The following $rootScope objects are built out of the application configuration (managed by the themeCatalogService) and hard-coded (builtin) objects.
  // 
  // $rootScope.theme   - an array of all themes known to this application (builtin + imported)
  // $rootScope.themeId - the numeric, ordinal id for the currently applied theme
  // $rootScope.theme   - the current theme object being rendered and used by the application
  // $rootScope.skinId  - the numeric, ordinal id for the currently applied skin
  // $rootScope.skin    - the current skin object being rendered and used by the application
  // 
  // "discovered" objects are used as a cache prior to importing them into this application; only the "discovery" views reference the "discovered" objects.
  // 
  // $rootScope.discoveredThemeHeaders - an array of all theme headers discovered on a connected theme server
  // $rootScope.discoveredSkinHeaders  - an array of all skin headers discovered on a connected theme server; these skin headers correspond only to the current theme ($rootScope.theme)
  // 

  var root = {};
  root.walletId = '';

  root._themeSchemaVersion = function() {
    var catalog = themeCatalogService.getSync();
    return catalog.metadata.themeSchemaVersion;
  };

  root._skinSchemaVersion = function() {
    var catalog = themeCatalogService.getSync();
    return catalog.metadata.skinSchemaVersion;
  };

  root._themes = function() {
    var catalog = themeCatalogService.getSync();
    return catalog.themes;
  };

  root._themeById = function(themeId) {
    var catalog = themeCatalogService.getSync();
    return catalog.themes[themeId];
  };

  root._currentThemeId = function() {
    var catalog = themeCatalogService.getSync();
    return catalog.themeId;
  };

  root._currentSkinId = function() {
    return root._currentSkinIdForWallet(root.walletId);
  };

  root._currentSkinIdForWallet = function(walletId) {
    var catalog = themeCatalogService.getSync();
    var skinId = root._themeById(root._currentThemeId()).header.defaultSkinId;
    if (catalog.skinFor != undefined && catalog.skinFor[walletId] != undefined) {
      skinId = catalog.skinFor[walletId];
    }
    return skinId;
  };

  root._get = function(endpoint) {
    var catalog = themeCatalogService.getSync();
    $log.debug('GET ' + encodeURI(catalog.service.url + endpoint));
    return {
      method: 'GET',
      url: encodeURI(catalog.service.url + endpoint),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
  };

  root._get_local = function(endpoint) {
    $log.debug('GET ' + encodeURI(themeCatalogService.getApplicationDirectory() + endpoint));
    return {
      method: 'GET',
      url: encodeURI(themeCatalogService.getApplicationDirectory() + endpoint),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
  };

  // Return the relative resource path for the specified theme.
  root._getThemeResourcePath = function(themeName) {
    return '/themes/' + themeName;
  };

  // Return the absolute resource url for the specified theme.
  // This value is always local.
  root._getLocalThemeResourceUrl = function(themeName) {
    return encodeURI(themeCatalogService.getApplicationDirectory() + root._getThemeResourcePath(themeName));
  };

  // Return the relative resource path for the specified theme's skin.
  root._getSkinResourcePath = function(themeName, skinName) {
    return '/themes/' + themeName + '/skins/' + skinName;
  };

  // Return the absolute resource url for the specified theme's skin.
  // This value is always local.
  root._getLocalSkinResourceUrl = function(themeName, skinName) {
    return encodeURI(themeCatalogService.getApplicationDirectory() + root._getSkinResourcePath(themeName, skinName));
  };

  // Get the skin index for the specified skinName in the theme.
  // Return the index for appending the skin if the theme does not have a skin named skinName.
  root._getSkinIndex = function(theme, skinName) {
    var index = theme.skins.length;
    for (var i = 0; i < theme.skins.length; i++) {
      if (theme.skins[i].header.name == skinName) {
        index = i;
        break;
      }
    }
    return index;
  }

  root._bootstrapTheme = function(themeDef, callback) {
    $http(root._get_local(root._getThemeResourcePath(themeDef.theme) + '/theme.json')).then(function(response) {

      // Initialize the theme.
      // 
      var themeJSON = JSON.stringify(response.data);
      var themeResourceUrl = root._getLocalThemeResourceUrl(themeDef.theme);

      themeJSON = themeJSON.replace(/<theme-path>/g, themeResourceUrl);
      var theme = JSON.parse(themeJSON);

      // Replace resource tags with paths.
      for (var n = 0; n < theme.resources.length; n++) {
        themeJSON = themeJSON.replace('<resource-' + n + '>', theme.resources[n]);
      }
      theme = JSON.parse(themeJSON);

      // The defaultSkinName attribute is no longer needed.
      // The resources attribute is no longer needed.
      var defaultSkinName = theme.header.defaultSkinName;
      delete theme.header.defaultSkinName;
      delete theme.resources;

      $rootScope.themes = [];
      $rootScope.themes[0] = lodash.cloneDeep(theme);
      $rootScope.themeId = 0;
      $rootScope.theme = $rootScope.themes[$rootScope.themeId];

      // Initialize the skins.
      // 
      var promises = [];
      for (var i = 0; i < themeDef.skins.length; i++) {
        // Collect and serialize all http requests to get skin files.
        promises.push(
          $http(root._get_local(root._getSkinResourcePath(themeDef.theme, themeDef.skins[i]) + '/skin.json')).then(function(response) {

            var skin = response.data;
            var themeResourceUrl = root._getLocalThemeResourceUrl(themeDef.theme);
            var skinResourceUrl = root._getLocalSkinResourceUrl(themeDef.theme, skin.header.name);

            var skinJSON = JSON.stringify(skin);
            skinJSON = skinJSON.replace(/<theme-path>/g, themeResourceUrl);
            skinJSON = skinJSON.replace(/<skin-path>/g, skinResourceUrl);
            skin = JSON.parse(skinJSON);

            // Replace resource tags with paths.
            for (var n = 0; n < skin.resources.length; n++) {
              skinJSON = skinJSON.replace('<resource-' + n + '>', skin.resources[n]);
            }
            skin = JSON.parse(skinJSON);

            // The resources attribute is no longer needed.
            delete skin.resources;

            $rootScope.theme.skins.push(skin);

            if (defaultSkinName == skin.header.name) {
              $rootScope.theme.header.defaultSkinId = $rootScope.theme.skins.length - 1;
            }
          })
        );
      }

      $q.all(promises).then(function() {
        // This is run after all of the http requests are done.
        $rootScope.skinId = $rootScope.theme.header.defaultSkinId;
        $rootScope.skin = $rootScope.theme.skins[$rootScope.theme.header.defaultSkinId];

        if (callback) {
          callback();
        }
      }).catch(function(response) {
        $log.debug('Error: failed to GET local skin resources ' + response.config.url);
      });

    }).catch(function(response) {
      $log.debug('Error: failed to GET ' + response.config.url);
    });

  };

  // Build and publish the initial theme catalog.
  root._buildCatalog = function(callback) {

    themeCatalogService.get(function(err, catalog) {
      $log.debug('Theme catalog read');
      if (err) {
        $log.debug('Failed to read theme catalog: ' + JSON.stringify(err)); // TODO: put out string, not JSON
        return;
      }

      var catalogThemes = catalog.themes || {};

      if (lodash.isEmpty(catalogThemes)) {
        $log.debug('Initializing theme catalog');
        var cat = {
          themeId: {},
          themes: {}
        };

        cat.themeId = $rootScope.themeId;
        cat.themes = $rootScope.themes;

        themeCatalogService.set(cat, function(err) {
          if (err) {
            $rootScope.$emit('Local/DeviceError', err);
            return;
          }

          $rootScope.$emit('Local/ThemeUpdated');
          callback();
        });

      } else {
        root._publishCatalog();
        callback();
      }

    });
  };

  // Publish the current configuration to $rootScope. Views only read from $rootScope values.
  root._publishCatalog = function() {
    $rootScope.themes = lodash.cloneDeep(root._themes());
    $rootScope.themeId = root._currentThemeId();
    $rootScope.theme = $rootScope.themes[$rootScope.themeId];
    $rootScope.skinId = root._currentSkinId();
    $rootScope.skin = $rootScope.theme.skins[root._currentSkinId()];
    $log.debug('Published theme/skin: '  + $rootScope.theme.header.name + '/' + $rootScope.skin.header.name + ' [walletId: ' + root.walletId + ']');
    $timeout(function() {
      $rootScope.$apply();
    });
  };


  ///////////////////////////////////////////////////////////////////////////////

  // init() - construct the theme catalog and publish the initial presentation.
  // 
  root.init = function() {
    root._bootstrapTheme(brand.features.theme.definition, function() {
        $log.debug('Theme service bootstrapped to theme/skin: ' +
          $rootScope.theme.header.name + '/' +
          $rootScope.skin.header.name +
          (root.walletId == '' ? ' [no wallet yet]' : ' [walletId: ' + root.walletId + ']'));

        root._buildCatalog(function() {
          $log.debug('Theme service initialized');
        });
      });
  };

  // updateSkin() - handles updating the skin when the wallet is changed.
  // 
  root.updateSkin = function(walletId) {
    root.walletId = walletId;
    var catalog = themeCatalogService.getSync();
    if (catalog.skinFor && catalog.skinFor[root.walletId] === undefined) {
      root.setSkinForWallet(root.getPublishedThemeDefaultSkinId(), root.walletId);
    } else {
      root.setSkinForWallet(catalog.skinFor[root.walletId], root.walletId);
    }
  };

  // setTheme() - sets the theme for the app.
  // 
  root.setTheme = function(themeId, callback) {
    $log.debug('' + (themeId != root.getPublishedThemeId() ?  'Switching theme...' : 'Reapplying theme...'));
    $log.debug('' + (themeId != root.getPublishedThemeId() ? 
      'Old theme: ' + root.getPublishedThemeById(root.getPublishedThemeId()).header.name + '\n' +
      'New theme: ' + root.getPublishedThemeById(themeId).header.name :
      'Current theme: ' + root.getPublishedThemeById(themeId).header.name));

    var cat = {
      themeId: {}
    };

    cat.themeId = themeId;

    themeCatalogService.set(cat, function(err) {
      if (err) {
        $rootScope.$emit('Local/DeviceError', err);
        return;
      }

      // Need to go through catalog.skinFor[] and remap all skins to be compatible with the new theme
      // Example; old theme has 12 skins, new theme has 6 skins
      //   if catalog.skinFor[walletId] = skin id 12 then it won't resolve with the new theme (since it has only 6 skins)
      //   
      // TODO: Should provide a UI for wallet to skin re-mapping using the new theme's skins
      // 
      // For now, simply force all catalog.skinFor to the themes default skin
      //
      var catalog = themeCatalogService.getSync();
      var cat = {
        skinFor: {}
      };

      // Assigned new theme default skin to all wallets.
      for (var walletId in catalog.skinFor) {
        $log.debug('Reassigning skin for wallet: ' + walletId +
          ', new skinId: ' + root.getCatalogTheme().header.defaultSkinId +
          ' (was skinId: ' + root.getCatalogSkinIdForWallet(walletId) + ')');

        cat.skinFor[walletId] = root.getCatalogTheme().header.defaultSkinId;
      }

      themeCatalogService.set(cat, function(err) {
        if (err) {
          $rootScope.$emit('Local/DeviceError', err);
          return;
        }

        root._publishCatalog();

        if (callback) {
          callback();
        }

        $rootScope.$emit('Local/ThemeUpdated');
        $rootScope.$emit('Local/SkinUpdated');

        notification.success(
          gettext('Success'),
          gettext('Theme set to \'' + root.getPublishedTheme().header.name + '\''),
          {color: root.getPublishedSkin().view.textHighlightColor,
           iconColor: root.getPublishedTheme().view.notificationBarIconColor,
           barBackground: root.getPublishedTheme().view.notificationBarBackground});
      });
    });
  };

  // setSkinForWallet() - sets the skin for the specified wallet.
  // 
  root.setSkinForWallet = function(skinId, walletId, callback) {
    $log.debug('' + (skinId != root.getPublishedSkinId() ?  'Switching skin... [walletId: ' + walletId + ']' : 'Reapplying skin... [walletId: ' + walletId + ']'));
    $log.debug('' + (skinId != root.getPublishedSkinId() ? 
      'Old skin: ' + root.getPublishedSkinById(root.getPublishedSkinId()).header.name + '\n' +
      'New skin: ' + root.getPublishedSkinById(skinId).header.name :
      'Current skin: ' + root.getPublishedSkinById(skinId).header.name));

    root.walletId = walletId;

    var cat = {
      skinFor: {}
    };

    cat.skinFor[root.walletId] = skinId;

    themeCatalogService.set(cat, function(err) {
      if (err) {
        $rootScope.$emit('Local/DeviceError', err);
        return;
      }

      root._publishCatalog();

      if (callback) {
        callback();
      }

      $rootScope.$emit('Local/SkinUpdated');
    });
  };

  ///////////////////////////////////////////////////////////////////////////////

  // get() functions return the $rootScope published or stored configuration values for use by controllers and services.
  // 
  root.isThemeCompatible = function(themeHeader) {
    return root._themeSchemaVersion() == themeHeader.schemaVersion;
  };
  root.isSkinCompatible = function(skinHeader) {
    return root._skinSchemaVersion() == skinHeader.schemaVersion;
  };

  root.getCatalog = function() {
    return themeCatalogService.getSync();
  }

  root.getCatalogThemes = function() {
    return root._themes();
  };

  root.getCatalogTheme = function() {
    return root._themeById(root._currentThemeId());
  };

  root.getCatalogThemeId = function() {
    return root._currentThemeId();
  };

  root.getCatalogSkinId = function() {
    return root._currentSkinIdForWallet(root.walletId);
  };

  root.getCatalogSkinIdForWallet = function(walletId) {
    return root._currentSkinIdForWallet(walletId);
  };

  root.getPublishedThemes = function() {
    return $rootScope.themes;
  }

  root.getPublishedThemeById = function(themeId) {
    return $rootScope.themes[themeId];
  };

  root.getPublishedThemeId = function() {
    return $rootScope.themeId;
  };

  root.getPublishedTheme = function() {
    return root.getPublishedThemeById(root.getPublishedThemeId());
  };

  root.getPublishedSkinsForTheme = function(themeId) {
    return root.getPublishedTheme(themeId).skins;
  };

  root.getPublishedSkins = function() {
    return root.getPublishedSkinsForTheme(root.getPublishedThemeId());
  };

  root.getPublishedSkinById = function(skinId) {
    return root.getPublishedTheme().skins[skinId];
  };

  root.getPublishedSkinId = function() {
    return $rootScope.skinId;
  };

  root.getPublishedThemeDefaultSkinId = function() {
    return root.getPublishedTheme().header.defaultSkinId;
  };

  root.getPublishedSkin = function() {
    var theme = root.getPublishedTheme();
    return theme.skins[root.getPublishedSkinId()];
  };

  ///////////////////////////////////////////////////////////////////////////////

  // Theme discovery
  // 
  root.discoverThemes = function(callback) {

    // Get theme headers from the server.
    $http(root._get('/themes')).then(function(response) {
      var themeHeaders = response.data.data;
      var discoveredThemeHeaders = [];

      for (var i = 0; i < themeHeaders.length; i++) {
        // Check theme compatibility. Allow only exact version match.
        if (root.isThemeCompatible(themeHeaders[i])) {
          discoveredThemeHeaders.push(themeHeaders[i]);
        } else {
          $log.debug('Not a compatible theme. Skipping theme: ' + themeHeaders[i].name);
        }
      }

      $rootScope.discoveredThemeHeaders = discoveredThemeHeaders;
      $log.debug('Theme service: discovered ' + discoveredThemeHeaders.length + ' themes');
      callback(discoveredThemeHeaders);
    }).catch(function(response) {
      callback([]);
      $log.debug('Error: failed to GET theme resources from ' + response.config.url);
    });
  };

  root.importTheme = function(discoveredThemeId, callback) {

    var catalog = themeCatalogService.getSync();
    var discoveredThemeName = $rootScope.discoveredThemeHeaders[discoveredThemeId].name;

    // Get the full theme from the server.
    $http(root._get('/themes/' + discoveredThemeName)).then(function(response) {

      // Import the discovered theme.
      // Read the full theme from the theme server and add it to this applications configuration settings.
      var discoveredTheme = response.data;
      var catalogThemes = catalog.themes || [];

      // Avoid adding duplicates. The theme name is the key. Re-import the theme if it was previously imported.
      var index = catalogThemes.length || 0;
      var i;
      for (i = 0; i < catalogThemes.length; i++) {
        if (catalogThemes[i].header.name == discoveredTheme.header.name) {
          index = i;
          break;
        }
      }

      catalogThemes[index] = discoveredTheme;

      var cat = {
        themes: []
      };
      
      cat.themes = lodash.cloneDeep(catalogThemes);

      themeCatalogService.set(cat, function(err) {
        if (err) {
          $rootScope.$emit('Local/DeviceError', err);
          return;
        }

        root._publishCatalog();

        if (callback) {
          callback(catalog[index]);
        }

        notification.success(
          gettext('Success'),
          gettext('Imported theme \'' + catalog.themes[index].header.name + '\''),
          {color: root.getPublishedSkin().view.textHighlightColor,
           iconColor: root.getPublishedTheme().view.notificationBarIconColor,
           barBackground: root.getPublishedTheme().view.notificationBarBackground});

        $log.debug('Imported theme \'' + catalog.themes[index].header.name + '\'');
      });
    }).catch(function(response) {
      callback({});
      $log.debug('Error: failed to GET theme resources from ' + response.config.url);
    });
  };

  ///////////////////////////////////////////////////////////////////////////////

  // Skin discovery
  // 
  root.discoverSkins = function(theme, callback) {

    // Get skin headers from the server.
    $http(root._get('/themes/' + theme.header.name + '/skins')).then(function(response) {
      var skinHeaders = response.data.data;
      var discoveredSkinHeaders = [];

      for (var i = 0; i < skinHeaders.length; i++) {
        // Check skin compatibility. Allow only exact version match.
        if (root.isSkinCompatible(skinHeaders[i])) {
          discoveredSkinHeaders.push(skinHeaders[i]);
        } else {
          $log.debug('Not a compatible skin. Skipping skin: ' + skinHeaders[i].name);
        }
      }

      $rootScope.discoveredSkinHeaders = discoveredSkinHeaders;
      $log.debug('Theme service: discovered ' + discoveredSkinHeaders.length + ' skins');
      callback(discoveredSkinHeaders);
    }).catch(function(response) {
      callback([]);
      $log.debug('Error: failed to GET skin resources from ' + response.config.url);
  });
  };

  // Import skin into the published theme.
  root.importSkin = function(discoveredSkinId, callback) {

    var theme = root.getPublishedTheme();
    var skinName = $rootScope.discoveredSkinHeaders[discoveredSkinId].name;

    $http(root._get('/themes/' + theme.header.name + '/' + skinName)).then(function(response) {

      var discoveredSkin = response.data;

      var catalog = themeCatalogService.getSync();
      var catalogThemes = catalog.themes || {};

      // Find the theme to which the skin will be added.
      var t_index = catalogThemes.length || 0;
      var i;
      for (i = 0; i < catalogThemes.length; i++) {
        if (catalogThemes[i].header.name == theme.header.name) {
          t_index = i;
          break;
        }
      }

      // Find the skin index to attach the new skin.
      // Don't add duplicates. Replace the existing skin.
      var s_index = root._getSkinIndex(catalogThemes[t_index], discoveredSkin.header.name);

      // Attach the skin to the theme.
      catalogThemes[t_index].skins[s_index] = discoveredSkin;

      var cat = {
        themes: []
      };
      
      cat.themes = lodash.cloneDeep(catalogThemes);

      themeCatalogService.set(cat, function(err) {
        if (err) {
          $rootScope.$emit('Local/DeviceError', err);
          return;
        }

        root._publishCatalog();

        if (callback) {
          callback(catalog.themes[t_index].skins[s_index]);
        }

        notification.success(
          gettext('Success'),
          gettext('Imported skin \'' + catalog.themes[t_index].skins[s_index].header.name + '\''),
          {color: root.getPublishedSkin().view.textHighlightColor,
           iconColor: root.getPublishedTheme().view.notificationBarIconColor,
           barBackground: root.getPublishedTheme().view.notificationBarBackground});

        $log.debug('Imported skin \'' + catalog.themes[t_index].skins[s_index].header.name + '\'');
      });
    }).catch(function(response) {
      callback({});
      $log.debug('Error: failed to GET skin resources from ' + response.config.url);
    });
  };

	return root;
});
