# TrueQueue Inspector

A very basic interface to inspect the contents of a true queue instance backed by redis. [TrueQueue](https://github.com/mobmewireless/true_queue) is a gem developed by MobMe Wireless, you can find out more [here](https://github.com/mobmewireless/true_queue).

I made this as an excercise to learn node, backbone and some redis. Inspired by [RabbitMQ Management Plugin](http://www.rabbitmq.com/management.html).

## Features
* Lists all the queues in connected redis instance
* Shows queue size, enqueue rate and dequeue rate instantaneously
* Graphs for easy analysis
* Preview the contents of queue

## Installation
    npm install
    node app.js
