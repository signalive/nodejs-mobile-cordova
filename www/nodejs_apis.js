// Bridge between the Cordova UI and the Node.js Mobile plug-in

'use strict';

var utils = require('cordova/utils');
var EventEmitter = require('./nodejs_events');

var EVENT_CHANNEL = '_EVENTS_';

var channels = {};

/*
 * This classes is defined in cordova-bridge/index.js as well.
 * Any change made here should be ported to cordova-bridge/index.js too.
 * The MessageCodec class provides two static methods to serialize/deserialize
 * the data sent through the events channel.
*/

function MessageCodec () {
  var args = Array.prototype.slice.call(arguments);
  this.event = args[0];
  this.payload = JSON.stringify(args.slice(1));
}

// Serialize the message payload and the message.
MessageCodec.serialize = function () {
  var args = Array.prototype.slice.call(arguments);
  var envelope = new MessageCodec(args[0], args.slice(1));
  // Return the serialized message, that can be sent through a channel.
  return JSON.stringify(envelope);
}

// Deserialize the message and the message payload.
MessageCodec.deserialize = function (message) {
  var envelope = JSON.parse(message);
  if (typeof envelope.payload !== 'undefined') {
    envelope.payload = JSON.parse(envelope.payload);
  }
  return envelope;
}


/**
 * Channel super class.
 */
var ChannelSuper = function (name) {
  ChannelSuper.__super__.constructor.apply(this);
  this.name = name;
  // Renaming the 'emit' method to 'emitLocal' is not strictly needed, but
  // it is useful to clarify that 'emitting' on this object has a local
  // scope: it emits the event on the Node side only, it doesn't send
  // the event to Cordova.
  this.emitLocal = this.emit;
  delete this.emit;
};

utils.extend(ChannelSuper, EventEmitter);

/**
 * Events channel class that supports user defined event types with
 * optional arguments. Allows to send any serializable
 * JavaScript object supported by 'JSON.stringify()'.
 * Sending functions is not currently supported.
 * Includes the previously available 'send' method for 'message' events.
 */
var EventChannel = function () {
  EventChannel.__super__.constructor.apply(this, Array.prototype.slice.call(arguments));
};
utils.extend(EventChannel, ChannelSuper);

EventChannel.prototype.post = function () {
  var args = Array.prototype.slice.call(arguments);
  cordova.exec(null, null, 'NodeJS', 'sendMessageToNode', [this.name, MessageCodec.serialize(args[0], args.slice(1))]);
}

// Posts a 'message' event, to be backward compatible with old code.
EventChannel.prototype.send = function () {
  var args = Array.prototype.slice.call(arguments);
  this.post('message', args);
}

// Sets a listener on the 'message' event, to be backward compatible with old code.
EventChannel.prototype.setListener = function (callback) {
  this.on('message', callback);
}
EventChannel.prototype.processData = function (data) {
  // The data contains the serialized message envelope.
  var envelope = MessageCodec.deserialize(data);
  var args = [envelope.event].concat(envelope.payload);
  this.emitLocal.apply(this, args);
}

/*
 * Dispatcher for all channels. This method is called by the plug-in
 * native code to deliver messages and events from Node.
 * The first argument is the channel name.
 * The second argument is the data.
 */
function allChannelsListener(args) {
  var channelName = args[0];
  var data = args[1];

  if (channels.hasOwnProperty(channelName)) {
    channels[channelName].processData(data);
  } else {
    console.error('Error: Channel not found:', channelName);
  }
}

// Register the listern for all channels
cordova.exec(allChannelsListener, allChannelsListener, 'NodeJS', 'setAllChannelsListener', null);

/**
 * Private methods.
 */
function registerChannel(channel) {
  channels[channel.name] = channel;
}

function startEngine(command, args, callback) {
  cordova.exec(
    function(arg) {
      if (callback) {
        callback(null);
      }
    },
    function(err) {
      if (callback) {
        callback(err);
      }
    },
    'NodeJS',
    command,
    [].concat(args)
  );
}

/**
 * Module exports.
 */
function start(filename, callback, options) {
  options = options || {};
  startEngine('startEngine', [filename, options], callback);
}

function startWithScript(script, callback, options) {
  options = options || {};
  startEngine('startEngineWithScript', [script, options], callback);
}

var eventChannel = new EventChannel(EVENT_CHANNEL);
registerChannel(eventChannel);

module.exports = exports = {
  start: start,
  startWithScript: startWithScript,
  channel: eventChannel,
  MessageCodec: MessageCodec,
  ChannelSuper: ChannelSuper,
  EventChannel: EventChannel
};
