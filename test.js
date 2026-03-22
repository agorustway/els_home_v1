async function run() {
  try {
    const res = await fetch("https://www.nollae.com/api/vehicle-tracking/drivers?phone=01012345678");
    const text = await res.text();
    console.log("=== DRIVER 조회 결과 ===");
    console.log(text);
  } catch(e) {
    console.error(e);
  }
}
run();