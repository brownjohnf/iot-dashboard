'use strict';

const
  _       = require('lodash'),
  express = require('express'),
  app     = express(),
  server  = require('http').createServer(app),
  mqtt    = require('mqtt'),
  io      = require('socket.io')(server)

// set vars from env
const
  mqttServer  = process.env.MQTT_SERVER,
  mqttTopic   = process.env.MQTT_TOPIC,
  dashboardPort = process.env.PORT,
  devices     = _.fromPairs(_.map(_.split(process.env.DEVICES, ','), pair => {
    return _.split(pair, '=')
  }))

console.log(mqttTopic, mqttServer)
let handlersRegistered = false
console.log('devices: ', devices)

// set up connections
const mqttClient  = mqtt.connect(mqttServer)

const handlers = {
  temperature: [
    (channel, room, message) => {
      const readings = []

      return (channel, room, message) => {
        const data = JSON.parse(message)
        readings.push(data.value)

        if (readings.length > 10) {
          readings.unshift()
        }
        console.log(readings)

        if (_.mean(readings) > 67.0) {
          return
        }

        publishToMqtt(channel, 'furnace', {
          type: 'bool',
          kind: 'action',
          value: true,
          device: {
            name: 'furnace1',
          },
          timestamp: (new Date()).getTime()
        }, 'furnace1')
      }
    }
  ]
}

app.use(express.static(__dirname))

mqttClient.on('connect', () => {
  mqttClient.subscribe(`${mqttTopic}/#`),
  mqttClient.publish(mqttTopic, "iot dashboard connected")
})

app.get('/', (req, res) => {
  res.render('./index.html')
})

// On an incoming message, run all handlers matching the topic
mqttClient.on('message', (topic, message) => {
  // message is Buffer
  console.log(topic, message.toString())

  const [channel, room, ...rest]  = _.split(topic, '/')

  _.forEach(_.get(handlers, room, []), (handler) => {
    handler(channel, room, message.toString(), topic, ...rest)
  })
})

// Register handlers when we have a client connected
io.on('connection', function (socket) {
  console.log('socket.io connection open')

  if (handlersRegistered === true) {
    console.log('client connected, but handlers already registered')
  }

  if (handlers.temperature == null) {
    _.set(handlers, 'temperature', [])
  }

  if (handlers.humidity == null) {
    _.set(handlers, 'humidity', [])
  }

  if (handlers.events == null) {
    _.set(handlers, 'events', [])
  }

  if (handlers.lightlevel == null) {
    _.set(handlers, 'lightlevel', [])
  }

  handlers.lightlevel.push((channel, room, message) => {
    const data = JSON.parse(message)
    data.device.name = _.get(devices, data.device.id, 'unknown')
    socket.emit('updateChart', data)
  })

  handlers.temperature.push((channel, room, message) => {
    const data = JSON.parse(message)
    data.device.name = _.get(devices, data.device.id, 'unknown')
    socket.emit('updateChart', data)
  })

  handlers.humidity.push((channel, room, message) => {
    const data = JSON.parse(message)
    data.device.name = _.get(devices, data.device.id, 'unknown')
    socket.emit('updateChart', data)
  })

  handlers.events.push((channel, room, message) => {
    console.log('adding motion event')
    const data = JSON.parse(message)
    data.device.name = _.get(devices, data.device.id, 'unknown')
    socket.emit('addEvent', data)
  })

  handlersRegistered = true
});

server.listen(dashboardPort)

