import React, { createContext, useContext, useState } from 'react';
import { Globe } from 'lucide-react';

export const translations = {
  en: {
    appTitle: 'Omni-Kiosk 360',
    appSubtitle: 'Self-Service Ticket Issuance',
    appFooterSecure: 'OMNI-SECURE ON-SITE TERMINAL',
    appFooterId: 'SYSTEM ID: KSK-001 | © 2026 P82 GROUP',
    registerTitle: 'Smart Lead Generation',
    registerSubtitle: 'Please select your service for the best support',
    trackTitle: 'Track Your Ticket',
    trackSubtitle: 'Enter your ticket number, or the phone number you booked with',
    checkinTitle: 'Online Ticket Check-in',
    checkinSubtitle: 'Enter ticket number and verify email/phone to activate online ticket',
    newTicket: 'New Ticket',
    trackTicket: 'Track Ticket',
    checkinTab: 'Check-in',
    serviceLabel: 'REQUIRED SERVICE',
    phoneLabel: 'PHONE NUMBER',
    phonePlaceholder: 'e.g. 0912345678',
    phoneOptional: '(optional)',
    phoneHelp: 'Used to find your ticket if you lose the number',
    phoneSkipWarning: 'You can leave this blank — but without it we cannot find your ticket again if you lose the number.',
    ticketLabel: 'TICKET NUMBER OR PHONE',
    checkinLabel: 'Ticket Number',
    checkinIdentifierLabel: 'Email / Phone',
    ticketPlaceholder: 'e.g. TKT-101',
    trackPlaceholder: 'TKT-101 or 0912345678',
    checkinIdentifierPlaceholder: 'registered email or phone number',
    selectService: '-- SELECT SERVICE --',
    printTicket: 'PRINT MY TICKET',
    trackMyTicket: 'TRACK MY TICKET',
    verifyTicket: 'VERIFY TICKET',
    completeCheckin: 'COMPLETE CHECK-IN',
    finishNew: 'Finish / New Turn',
    inQueue: 'You are in Queue',
    yourTurn: 'Your Turn!',
    beingServed: 'Being Served',
    success: 'Success!',
    reservationPending: 'Reservation Pending',
    reservationCancelled: 'Reservation Cancelled',
    noShow: 'Marked as No-Show',
    serviceComplete: 'Service Complete',
    position: (n: number) => `Position #${n} in line`,
    proceedCounter: 'Please proceed to the counter',
    expiredDesc: 'This reservation is expired. Please create a new ticket.',
    checkinExpiresIn: (mins: number) => `Check-in expires in ~${mins} mins`,
    pleaseCheckin: 'Please check in at the counter',
    pleaseCreateNew: 'Please create a new ticket.',
    noShowDesc: 'You were called but did not appear. Please speak to a staff member.',
    thankYouVisiting: 'Thank you for visiting!',
    yourTicketNumber: 'Your Ticket Number',
    aiWaitTime: 'Estimated Wait Time',
    waitUnavailable: 'No counter is open yet',
    waitUnavailableHint: 'Your ticket is valid. An estimate will appear as soon as a counter opens.',
    noStaffOnDuty: 'No counter is currently open for this service. You can still take a ticket, but it cannot be called until a staff member signs in.',
    mins: 'mins',
    realTimeTracking: 'Real-time tracking active',
    status: 'Status',
    scanMonitor: 'Scan to follow your place from your phone',
    scanExplain: 'You are free to leave the waiting area — your phone will show your position live.',
    verified: 'Verified',
    ticket: 'Ticket',
    checkinRequiredTitle: 'Check-in Required',
    checkinRequiredDesc: 'Please go to the check-in counter and provide your ticket number + registered email/phone to activate your queue ticket.',
    experienceTitle: 'How was your experience?',
    commentsPlaceholder: 'Any comments? (optional)',
    submitFeedback: 'Submit Feedback',
    feedbackSuccess: '✅ Thank you for your feedback!',
    enterTicketError: 'Please enter ticket number.',
    enterIdentifierError: 'Please enter email or phone used when booking online.',
    enterPhoneError: 'Please enter your phone number.',
    checkinSuccess: 'Check-in successful!',
    alreadyCheckedIn: 'You are already checked in.',
    downgradedNotice: 'You arrived after your appointment window, so your ticket is now ordered by arrival time.',
    feedbackError: 'Could not submit feedback. Please try again.',
    noTicketsFound: 'No live ticket found for that number.',
    servicesLoading: 'Loading services...',
    servicesError: 'Cannot reach the queue server. Please ask a staff member.',
    closedTitle: 'The centre is closed',
    closedDesc: (open: string, close: string) => `Opening hours are ${open} – ${close}, Monday to Friday.`,
    cutoffTitle: 'New tickets have closed for today',
    cutoffDesc: (last: string) => `Tickets are issued until ${last} so everyone already waiting can be served.`
  },
  zh: {
    appTitle: 'Omni-Kiosk 360',
    appSubtitle: '自助票务发行',
    appFooterSecure: 'OMNI-SECURE 现场终端',
    appFooterId: '系统ID：KSK-001 | © 2026 P82 GROUP',
    registerTitle: '智能潜在客户生成',
    registerSubtitle: '请选择您的服务以获得最佳支持',
    trackTitle: '追踪我的票',
    trackSubtitle: '请输入票号，或预订时使用的电话号码',
    checkinTitle: '在线门票签到',
    checkinSubtitle: '输入票号并验证电子邮件/电话以激活在线门票',
    newTicket: '新票',
    trackTicket: '轨道票',
    checkinTab: '签到',
    serviceLabel: '所需服务',
    phoneLabel: '电话号码',
    phonePlaceholder: '例如：0912345678',
    phoneOptional: '（选填）',
    phoneHelp: '如果您丢失票号，可用它找回您的票',
    phoneSkipWarning: '可以留空 —— 但若不填写，票号丢失后我们将无法帮您找回。',
    ticketLabel: '票号或电话',
    checkinLabel: '票号',
    checkinIdentifierLabel: '电子邮件/电话',
    ticketPlaceholder: '例如：TKT-101',
    trackPlaceholder: 'TKT-101 或 0912345678',
    checkinIdentifierPlaceholder: '注册的电子邮件或电话号码',
    selectService: '-- 选择服务 --',
    printTicket: '打印我的票',
    trackMyTicket: '追踪我的票',
    verifyTicket: '验证门票',
    completeCheckin: '完成签到',
    finishNew: '完成 / 新轮次',
    inQueue: '你在排队',
    yourTurn: '轮到你了！',
    beingServed: '正在服务中',
    success: '成功！',
    reservationPending: '预约待定',
    reservationCancelled: '预约已取消',
    noShow: '已标记为未到',
    serviceComplete: '服务完成',
    position: (n: number) => `排队位置 #${n}`,
    proceedCounter: '请前往柜台',
    expiredDesc: '此预订已过期。请创建一张新票。',
    checkinExpiresIn: (mins: number) => `签到将在约 ${mins} 分钟后过期`,
    pleaseCheckin: '请在柜台签到',
    pleaseCreateNew: '请创建一张新票。',
    noShowDesc: '已叫号但您未出现。请与工作人员联系。',
    thankYouVisiting: '感谢您的光临！',
    yourTicketNumber: '您的票号',
    aiWaitTime: '预估等待时间',
    waitUnavailable: '暂无柜台开放',
    waitUnavailableHint: '您的票依然有效。柜台开放后将立即显示预计等待时间。',
    noStaffOnDuty: '该服务目前没有开放的柜台。您仍可取票，但在工作人员登录之前无法叫号。',
    mins: '分钟',
    realTimeTracking: '实时跟踪活动',
    status: '状态',
    scanMonitor: '扫描二维码，用手机跟踪您的排队位置',
    scanExplain: '您可以离开等候区 —— 手机会实时显示您的位置。',
    verified: '已验证',
    ticket: '门票',
    checkinRequiredTitle: '需要签到',
    checkinRequiredDesc: '请前往签到柜台提供您的票号和注册的电子邮件/电话，以激活您的排队门票。',
    experienceTitle: '您的体验如何？',
    commentsPlaceholder: '有什么意见吗？（可选）',
    submitFeedback: '提交反馈',
    feedbackSuccess: '✅ 感谢您的反馈！',
    enterTicketError: '请输入票号。',
    enterIdentifierError: '请输入在线预订时使用的电子邮件或电话。',
    enterPhoneError: '请输入您的电话号码。',
    checkinSuccess: '签到成功！',
    alreadyCheckedIn: '您已经签到。',
    downgradedNotice: '您在预约时段之后到达，因此您的票现在按到达时间排序。',
    feedbackError: '无法提交反馈。请重试。',
    noTicketsFound: '找不到该号码对应的有效票。',
    servicesLoading: '正在加载服务...',
    servicesError: '无法连接排队服务器。请联系工作人员。',
    closedTitle: '本中心已关闭',
    closedDesc: (open: string, close: string) => `营业时间为周一至周五 ${open} – ${close}。`,
    cutoffTitle: '今日已停止发放新票',
    cutoffDesc: (last: string) => `新票发放至 ${last}，以便为已在等候的客户提供服务。`
  }
};

type Language = 'en' | 'zh';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: typeof translations.en;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [lang, setLang] = useState<Language>('en');

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const LangToggle = () => {
  const { lang, setLang } = useLanguage();
  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
      className="absolute top-4 right-4 flex items-center gap-1 z-50 text-gray-700 bg-white/50 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm hover:bg-white transition-all"
      title="Switch language / 切换语言"
    >
      <Globe size={14} />
      <span className="text-sm font-semibold">{lang === 'en' ? '中文' : 'English'}</span>
    </button>
  );
};
