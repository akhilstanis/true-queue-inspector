var Queue = Backbone.Model.extend({
  defaults: {
    name: 'queue',
    previousLength: 0,
    previousMaxScore: 0,
    PreviousFetchTimeStamp: null,
    pushRate: 0,
    dequeueRate: 0,
    currentLength: 0
  },
  initialize: function(attrs){
    var self = this;
    self.set(attrs);
    now.QueueSnapshot(self.get('name'), null, function(result,meta){
      self.set({
        PreviousFetchTimeStamp: Date.now(),
        previousLength: meta.previousLength,
        previousMaxScore: meta.previousMaxScore,
        currentLength: result.items
      });
      self.log();
    });
  },
  previousData: function(){
    return _.pick(this.toJSON(), 'previousLength', 'previousMaxScore');
  },
  updateQueue: function(){
    var self = this;
    now.QueueSnapshot(self.get('name'), self.previousData(), function(result,meta){
      var currentTimeStamp = Math.round(Date.now()/1000);
      var fetchInterval    = currentTimeStamp - self.get('PreviousFetchTimeStamp');
      var pushRate         = Math.round(result.newItems/fetchInterval);
      var dequeueRate      = Math.round(result.removedItems/fetchInterval);
      self.set({
        pushRate: pushRate,
        dequeueRate: dequeueRate,
        PreviousFetchTimeStamp: currentTimeStamp,
        previousLength: meta.previousLength,
        previousMaxScore: meta.previousMaxScore,
        currentLength: result.items
      });
      self.log();
    });
  },
  log: function(){
    console.log('Length => ' + this.get('currentLength') + ', Push Rate => ' + this.get('pushRate') + '/s, Dequeue Rate => ' + this.get('dequeueRate') + '/s')
  }
});

var QueueView = Backbone.View.extend({
  el: $('#queue-view'),
  initialize:function(attrs,callback){
    var self = this;
    self.$el.html('');

    this.model.on('change', this.render, this);
    this.startUpdateTimer(5000);
    //
    // Stats
    self.statsView = new QueueStatsView({ model: self.model })
    self.$el.append(this.statsView.render().$el);

    // Graphs
    self.graphViews = {
      currentLength: new GraphView({ title: 'Queue Length', unit: 'items' }),
      pushRate: new GraphView({ title: 'Enqueue Rate', unit: 'items/sec' }),
      dequeueRate: new GraphView({ title: 'Dequeue Rate', unit: 'items/sec' })
    }
    _.each(self.graphViews, function(v,k){ self.$el.append(v.render().$el); });

    // Stats
    self.peekView = new PeekView(self.model.get('name'));
    self.$el.append(this.peekView.render().$el);

    self.render();
  },
  startUpdateTimer: function(interval){
    var self = this;
    this.updateTimer = setInterval(function(){ self.model.updateQueue(); }, interval);
  },
  stopUpdateTimer: function(){
    clearInterval(this.updateTimer);
  },
  changeTimerInterval: function(newInterval){
    this.stopUpdateTimer();
    this.startUpdateTimer(newInterval);
  },
  render:function(){
    var self = this;
    this.statsView.update();
    var timestamp = (new Date()).getTime();
    _.each(self.graphViews, function(v,k){
       v.addPoint(timestamp,self.model.get(k));
    });
  }
});

var QueueStatsView = Backbone.View.extend({
  tagName: 'div',
  template: Handlebars.compile($('#stats-view-template').html()),
  render: function(){
    var html = this.template(this.model.toJSON());
    this.$el.html(html);
    return this;
  },
  update: function(){
    var els = this.$el.find('.value');
    var data = this.model.toJSON();
    els[0].innerHTML = data.currentLength;
    els[1].innerHTML = data.pushRate;
    els[2].innerHTML = data.dequeueRate;
  }
});

var GraphView = Backbone.View.extend({
  tagName: 'div',
  className: 'graph-container',
  initialize: function(attrs){
    var self = this;
    var currentTime = (new Date()).getTime();
    self.meta = attrs;
    self.graph = new Highcharts.Chart({
      chart: { renderTo: self.el, type: 'spline', margin: [50,50,50,50] },
      title: { text: self.meta.title },
      xAxis: { type: 'datetime'      },
      yAxis: { title: { text: 'Value' }, min: -1 },
      tooltip: {
        formatter: function() {
          return '<b>'+ this.series.name +'</b><br/>'+
          Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', this.x) +'<br/>'+
          Highcharts.numberFormat(this.y, 2) + ' ' + self.meta.unit;
        }
      },
      legend: { enabled: false },
      series: [{ name: self.meta.title, data: [[currentTime,0],[currentTime,0],[currentTime,0],[currentTime,0],[currentTime,0],[currentTime,0],[currentTime,0],[currentTime,0],[currentTime,0],[currentTime,0]] }]
    });
    self.render();
  },
  render: function(){
    this.graphSeries = this.graph.series[0];
    return this;
  },
  addPoint: function(x,y){
    this.graphSeries.addPoint([x, y], true, true);
  },
});


// Peek Models and Views
var QueueItem = Backbone.Model.extend({
  defaults: { id: 0, data : '', metadata: '', raw: [] },
  initialize: function(attrs){
    var id = parseInt(this.get('raw')[0]),
    parsed = JSON.parse(this.get('raw')[1]);
    this.set({ id: id, data: JSON.stringify(parsed[0]), metadata: JSON.stringify(parsed[1])});
  }
});

var QueueItemView = Backbone.View.extend({
  tagName: 'tr',
  template: Handlebars.compile('<td>{{id}}</td><td>{{data}}</td><td>{{metadata}}</td>'),
  render: function(){
    this.$el.html(this.template(this.model.toJSON()));
    return this;
  }
});

var QueueItemCollection = Backbone.Collection.extend({
  model: QueueItem,
  get: function(queueName, size, callback){
    var self = this;
    now.getItems(queueName,size,function(res){
      res.forEach(function(i){
        self.add(new QueueItem({ raw: i }));
      });
      callback({ items: self.toJSON()});
    });
  }
});

var PeekView = Backbone.View.extend({
  tagName: 'div',
  id: 'peek-view',
  template: Handlebars.compile($('#peek-view-template').html()),
  resultsTemplate: Handlebars.compile($('#peek-view-results-template').html()),
  initialize: function(queueName){
    this.queueName = queueName;
    this.render();
  },
  events: {
    'click #btn-get': 'renderResults',
    'click .data, .metadata'   : 'ppJSON'
  },
  render: function(){
    this.$el.html(this.template({}));
    return this;
  },
  ppJSON: function(e){
    console.log('!');
    var el = $(e.currentTarget);
    if(el.hasClass('pp')){
      var unpp = el.children().first().html().replace(/\n\s*/g,'').replace(/:\s/g,':');
      el.html(unpp);
    } else {
      var pp = JSON.stringify(JSON.parse(el.html()),null,'  ');
      el.html('<pre>' + pp + '</pre>');
    }
    el.toggleClass('pp');
  },
  renderResults: function(){
    var self = this;
    var size = parseInt(this.$el.find('#size').val());
    new QueueItemCollection().get(self.queueName,size,function(data){
      self.$el.find('#results')[0].innerHTML = self.resultsTemplate(data);
    })
  }
});


// Home Queue List
var QueueListView = Backbone.View.extend({
  el: $('#queue-list'),
  template: Handlebars.compile("<div class='queue-title'><a href='#{{name}}'>{{name}}</a></div>"),
  initialize: function(){
    this.render();
  },
  render: function(){
    var self = this;
    now.getQueues(function(res){
      res.forEach(function(i){
        self.$el.append(self.template(i));
      });
    });
  }
});


$(function(){
  now.ready(function(){

    Highcharts.setOptions({
        global: {
            useUTC: false
        }
    });

    var AppRouter = Backbone.Router.extend({
      routes: {
        ""        :      "home",
        ":name"   :      "queue"
      },
      initialize: function(){
        this.queueList = new QueueListView();
      },
      home: function() {
        _.isUndefined(this.activeQueue) ? true : this.activeQueue.stopUpdateTimer();
        $('#queue-view, a.back').hide();
        $('#home').show();
      },
      queue: function(name) {
        if(!_.isUndefined(this.activeQueue) && this.activeQueue.model.get('name') == name)
          this.activeQueue.startUpdateTimer(5000)
        else this.activeQueue = new QueueView({ model: new Queue({ name: name }) });
        $('#home').hide();
        $('#queue-view, a.back').show();

      }
    });
    new AppRouter();
    Backbone.history.start();


  });
});


