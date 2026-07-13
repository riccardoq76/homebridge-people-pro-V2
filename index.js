const {
  PeopleProPlatform,
  PeopleProAccessory,
  PeopleProAllAccessory,
} = require('./src');

/* Register platform and accessories, set global variables */
module.exports = (homebridge) => {
  global.Service = homebridge.hap.Service;
  global.Characteristic = homebridge.hap.Characteristic;
  // Homebridge v2 / HAP-NodeJS v1+ removed the Formats/Units/Perms enums that used to
  // live as static properties on Characteristic. They now live on hap instead, so we
  // expose them the same way the rest of this plugin exposes Service/Characteristic.
  global.Formats = homebridge.hap.Formats;
  global.Units = homebridge.hap.Units;
  global.Perms = homebridge.hap.Perms;
  // eslint-disable-next-line global-require
  global.FakeGatoHistoryService = require('fakegato-history')(homebridge);

  PeopleProPlatform.setHomebridge(homebridge);

  homebridge.registerPlatform('homebridge-people-pro', 'PeoplePro', PeopleProPlatform);
  homebridge.registerAccessory('homebridge-people-pro', 'PeopleProAccessory', PeopleProAccessory);
  homebridge.registerAccessory('homebridge-people-pro', 'PeopleProAllAccessory', PeopleProAllAccessory);
};
