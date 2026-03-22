const fetch = require('node-fetch');
const fs = require('fs');

async function testDrivers() {
  console.log("1. 연락처 조회 테스트");
  // Assuming a sample phone format that might match
  const res = await fetch("http://localhost:3000/api/vehicle-tracking/drivers?phone=01012345678");
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

testDrivers();