// Test Apple CalDAV credentials
import { createDAVClient } from "tsdav";

const APPLE_ID = "hoon712@gmail.com";
const APPLE_APP_PASSWORD = "ytlb-dkqj-yiid-vepm";

async function testCalDAV() {
  console.log("🔑 Testing CalDAV credentials...");
  console.log(`   Apple ID: ${APPLE_ID}`);
  console.log(`   Password: ${APPLE_APP_PASSWORD.substring(0, 4)}****`);
  
  try {
    const client = await createDAVClient({
      serverUrl: "https://caldav.icloud.com",
      credentials: {
        username: APPLE_ID,
        password: APPLE_APP_PASSWORD,
      },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });
    
    console.log("✅ CalDAV 클라이언트 생성 성공!");
    
    const calendars = await client.fetchCalendars();
    console.log(`✅ 캘린더 ${calendars.length}개 발견:`);
    calendars.forEach((cal: any, i: number) => {
      console.log(`   ${i + 1}. ${cal.displayName || "이름없음"}`);
    });
    
    console.log("\n🎉 CalDAV 인증 성공!");
  } catch (err: any) {
    console.error("❌ CalDAV 인증 실패:");
    console.error(`   ${err.message}`);
    console.error(`   Full error:`, err);
  }
}

testCalDAV();
