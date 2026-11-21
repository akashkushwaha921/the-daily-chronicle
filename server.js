
require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`The Daily Chronicle is running on http://localhost:${PORT}`);
  console.log(`For mobile testing, use your computer's IPv4 address: http://10.92.17.141:${PORT}`);
});
