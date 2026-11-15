export interface SmsBudgetEnv {
  DB: D1Database;
  SMS_DAILY_LIMIT?: string;
  SMS_MONTHLY_LIMIT?: string;
}

export class SmsBudgetError extends Error {
  status:number;
  retryAfter?:number;
  code:string;
  constructor(status:number,message:string,retryAfter?:number,code='sms_limit_reached'){
    super(message);this.status=status;this.retryAfter=retryAfter;this.code=code;
  }
}

export function smsLimits(env:SmsBudgetEnv){
  function parse(value:string|undefined,fallback:number){
    if(value===undefined)return fallback;
    if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>1000000)
      throw new SmsBudgetError(503,'Text verification is temporarily unavailable.',undefined,'sms_limit_configuration');
    return Number(value);
  }
  return {daily:parse(env.SMS_DAILY_LIMIT,50),monthly:parse(env.SMS_MONTHLY_LIMIT,500)};
}

// Count attempts before contacting Twilio. Never refund an uncertain delivery:
// an upstream timeout or failure can still incur provider costs.
export async function reserveSmsSend(env:SmsBudgetEnv,at=Date.now()){
  const {daily,monthly}=smsLimits(env),date=new Date(at),iso=date.toISOString(),day=iso.slice(0,10),month=iso.slice(0,7);
  const nextDay=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1);
  const nextMonth=Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1);
  const blocked=(monthlyReached:boolean)=>new SmsBudgetError(429,
    'Text verification has reached its sending limit. Please try again later.',
    Math.max(1,Math.ceil(((monthlyReached?nextMonth:nextDay)-at)/1000)));
  if(!daily||!monthly)throw blocked(!monthly);
  // One SQLite statement serializes both checks and the reservation across all
  // Worker instances, invitations and editions sharing this D1 database.
  const reservation=await env.DB.prepare(`INSERT INTO sms_send_usage(day,month,attempts)
    SELECT ?1,?2,1 WHERE coalesce((SELECT sum(attempts) FROM sms_send_usage WHERE month=?2),0)<?4
    ON CONFLICT(day) DO UPDATE SET attempts=attempts+1
    WHERE attempts<?3 AND (SELECT sum(attempts) FROM sms_send_usage WHERE month=?2)<?4
    RETURNING attempts`).bind(day,month,daily,monthly).first();
  if(!reservation){
    const usage=await env.DB.prepare('SELECT coalesce(sum(attempts),0) AS attempts FROM sms_send_usage WHERE month=?1').bind(month).first<{attempts:number}>();
    throw blocked((usage?.attempts||0)>=monthly);
  }
}
