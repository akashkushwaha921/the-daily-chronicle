const express = require('express');
const path = require('path');
const helmet = require('helmet');
const indexRoutes = require('./routes/indexRoutes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRoutes);

app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Page Not Found' });
});

module.exports = app;
