import { canAccessNav, NAV_ITEMS } from "@/lib/rbac";

export const PRACTICE_COMPANY_CODE = "LEARN";
export const PRACTICE_COMPANY_NAME = "Ivaan Practice";

export type LearningLocale = "en" | "hi";

export type LocalizedString = Record<LearningLocale, string>;
export type LocalizedStringList = Record<LearningLocale, string[]>;

export type TourStep = {
  /** CSS selector; prefer [data-tour="..."] */
  target: string;
  title: LocalizedString;
  body: LocalizedString;
};

export type LessonDefinition = {
  id: string;
  href: string;
  /** Nav label key for matching NAV_ITEMS.href */
  completionEvent: string;
  title: LocalizedString;
  goal: LocalizedString;
  steps: LocalizedStringList;
  watchOuts: LocalizedStringList;
  tour: TourStep[];
};

function L(en: string, hi: string): LocalizedString {
  return { en, hi };
}

function LL(en: string[], hi: string[]): LocalizedStringList {
  return { en, hi };
}

function exploreTour(sectionEn: string, sectionHi: string): TourStep[] {
  return [
    {
      target: '[data-tour="app-nav"]',
      title: L("Navigation", "नेविगेशन"),
      body: L(
        `Use the sidebar to open ${sectionEn} and other sections you can access.`,
        `साइडबार से ${sectionHi} और अन्य उपलब्ध सेक्शन खोलें।`,
      ),
    },
    {
      target: '[data-tour="page-main"]',
      title: L(sectionEn, sectionHi),
      body: L(
        "This is the main work area for this section. Review the list, filters, and primary actions.",
        "यह इस सेक्शन का मुख्य कार्य क्षेत्र है। सूची, फ़िल्टर और मुख्य क्रियाएँ देखें।",
      ),
    },
    {
      target: '[data-tour="learning-banner"]',
      title: L("Practice safely", "सुरक्षित अभ्यास"),
      body: L(
        "You are in Learning Mode on the Practice company. Changes here do not affect ISE or PCMV.",
        "आप Learning Mode में Practice कंपनी पर हैं। यहाँ बदलाव ISE या PCMV को प्रभावित नहीं करते।",
      ),
    },
  ];
}

/** One lesson per nav section — powers /learn, tours, and /help. */
export const LESSONS: LessonDefinition[] = [
  {
    id: "dashboard",
    href: "/dashboard",
    completionEvent: "tour.completed",
    title: L("Dashboard", "डैशबोर्ड"),
    goal: L(
      "Understand your role KPIs and where to start daily work.",
      "अपने रोल के KPI और दैनिक कार्य कहाँ से शुरू करें, समझें।",
    ),
    steps: LL(
      ["Open Dashboard", "Review the cards for your role", "Use a card link to jump into work"],
      ["डैशबोर्ड खोलें", "अपने रोल के कार्ड देखें", "कार्य पर जाने के लिए कार्ड लिंक इस्तेमाल करें"],
    ),
    watchOuts: LL(
      ["Cards differ by role — you only see what you can act on."],
      ["कार्ड रोल के अनुसार बदलते हैं — केवल वही दिखता है जिस पर आप काम कर सकते हैं।"],
    ),
    tour: exploreTour("Dashboard", "डैशबोर्ड"),
  },
  {
    id: "approvals",
    href: "/approvals",
    completionEvent: "tour.completed",
    title: L("Approvals", "अनुमोदन"),
    goal: L(
      "Review pending approvals and know how history works.",
      "लंबित अनुमोदन देखें और इतिहास कैसे काम करता है जानें।",
    ),
    steps: LL(
      ["Open Approvals", "Open an item and review details", "Check Approvals history"],
      ["अनुमोदन खोलें", "एक आइटम खोलकर विवरण देखें", "अनुमोदन इतिहास देखें"],
    ),
    watchOuts: LL(
      ["In Learning Mode you practice on sandbox data only."],
      ["Learning Mode में केवल सैंडबॉक्स डेटा पर अभ्यास करें।"],
    ),
    tour: exploreTour("Approvals", "अनुमोदन"),
  },
  {
    id: "customers",
    href: "/sales/customers",
    completionEvent: "customer.created",
    title: L("Customers", "ग्राहक"),
    goal: L("Create a practice customer record.", "एक अभ्यास ग्राहक रिकॉर्ड बनाएँ।"),
    steps: LL(
      ["Open Customers", "Click New / Add customer", "Save a practice customer with a unique GST"],
      ["ग्राहक खोलें", "नया ग्राहक जोड़ें", "अद्वितीय GST के साथ अभ्यास ग्राहक सहेजें"],
    ),
    watchOuts: LL(
      ["GST must be unique across the system — use a fake practice GST."],
      ["GST पूरे सिस्टम में अद्वितीय होना चाहिए — नकली अभ्यास GST इस्तेमाल करें।"],
    ),
    tour: exploreTour("Customers", "ग्राहक"),
  },
  {
    id: "quotations",
    href: "/sales/quotations",
    completionEvent: "quotation.created",
    title: L("Quotations", "कोटेशन"),
    goal: L("Create a practice quotation.", "एक अभ्यास कोटेशन बनाएँ।"),
    steps: LL(
      ["Open Quotations", "Start a new quotation", "Add lines and save"],
      ["कोटेशन खोलें", "नया कोटेशन शुरू करें", "लाइन जोड़ें और सहेजें"],
    ),
    watchOuts: LL(
      ["Price warnings still appear — treat them as part of learning."],
      ["मूल्य चेतावनियाँ अभी भी दिखेंगी — इन्हें सीखने का हिस्सा मानें।"],
    ),
    tour: exploreTour("Quotations", "कोटेशन"),
  },
  {
    id: "proforma-invoices",
    href: "/sales/proforma-invoices",
    completionEvent: "tour.completed",
    title: L("Proforma Invoices", "प्रोफॉर्मा इनवॉइस"),
    goal: L(
      "Understand the PI list and how PIs connect to payments and dispatch.",
      "PI सूची और भुगतान/डिस्पैच से संबंध समझें।",
    ),
    steps: LL(
      ["Open Proforma Invoices", "Open a PI detail", "Note status and next steps"],
      ["प्रोफॉर्मा इनवॉइस खोलें", "PI विवरण खोलें", "स्थिति और अगले चरण नोट करें"],
    ),
    watchOuts: LL(
      ["PI drives payments, dispatch eligibility, and invoicing."],
      ["PI भुगतान, डिस्पैच पात्रता और इनवॉइसिंग चलाता है।"],
    ),
    tour: exploreTour("Proforma Invoices", "प्रोफॉर्मा इनवॉइस"),
  },
  {
    id: "projects",
    href: "/projects/proposals",
    completionEvent: "tour.completed",
    title: L("Projects", "प्रोजेक्ट्स"),
    goal: L("Explore project proposals and revision flow.", "प्रोजेक्ट प्रस्ताव और संशोधन प्रवाह देखें।"),
    steps: LL(
      ["Open Projects", "Review proposal list", "Open a proposal or start a new one in practice"],
      ["प्रोजेक्ट्स खोलें", "प्रस्ताव सूची देखें", "प्रस्ताव खोलें या अभ्यास में नया शुरू करें"],
    ),
    watchOuts: LL(
      ["Projects are separate from product sales quotations."],
      ["प्रोजेक्ट्स उत्पाद बिक्री कोटेशन से अलग हैं।"],
    ),
    tour: exploreTour("Projects", "प्रोजेक्ट्स"),
  },
  {
    id: "service",
    href: "/service",
    completionEvent: "tour.completed",
    title: L("Service", "सेवा"),
    goal: L("Learn the service request lifecycle.", "सेवा अनुरोध जीवनचक्र सीखें।"),
    steps: LL(
      ["Open Service", "Review requests / work types", "Open a request detail"],
      ["सेवा खोलें", "अनुरोध / कार्य प्रकार देखें", "अनुरोध विवरण खोलें"],
    ),
    watchOuts: LL(
      ["Service work is tracked separately from sales dispatch."],
      ["सेवा कार्य बिक्री डिस्पैच से अलग ट्रैक होता है।"],
    ),
    tour: exploreTour("Service", "सेवा"),
  },
  {
    id: "inventory",
    href: "/inventory",
    completionEvent: "tour.completed",
    title: L("Inventory", "इन्वेंटरी"),
    goal: L("Read stock positions and related inventory links.", "स्टॉक स्थिति और संबंधित लिंक समझें।"),
    steps: LL(
      ["Open Inventory", "Review stock / lots", "Follow links to incoming, transfers, or ledger"],
      ["इन्वेंटरी खोलें", "स्टॉक / लॉट देखें", "इनकमिंग, ट्रांसफर या लेजर के लिंक खोलें"],
    ),
    watchOuts: LL(
      ["Practice stock is sandbox-only and may be reset by admins."],
      ["अभ्यास स्टॉक केवल सैंडबॉक्स है और एडमिन रीसेट कर सकते हैं।"],
    ),
    tour: exploreTour("Inventory", "इन्वेंटरी"),
  },
  {
    id: "inventory-audits",
    href: "/inventory/audits",
    completionEvent: "tour.completed",
    title: L("Inventory Audit", "इन्वेंटरी ऑडिट"),
    goal: L("Understand opening and daily audit flows.", "ओपनिंग और दैनिक ऑडिट प्रवाह समझें।"),
    steps: LL(
      ["Open Inventory Audit", "Review audit types and status", "Open one audit detail"],
      ["इन्वेंटरी ऑडिट खोलें", "ऑडिट प्रकार और स्थिति देखें", "एक ऑडिट विवरण खोलें"],
    ),
    watchOuts: LL(
      ["Opening audits can gate ops until approved — learn the statuses carefully."],
      ["ओपनिंग ऑडिट अनुमोदन तक संचालन रोक सकते हैं — स्थितियाँ ध्यान से सीखें।"],
    ),
    tour: exploreTour("Inventory Audit", "इन्वेंटरी ऑडिट"),
  },
  {
    id: "stock-timeline",
    href: "/sales/inventory-timeline",
    completionEvent: "tour.completed",
    title: L("Stock Timeline", "स्टॉक टाइमलाइन"),
    goal: L("Use the timeline to explain availability to customers.", "ग्राहकों को उपलब्धता समझाने के लिए टाइमलाइन इस्तेमाल करें।"),
    steps: LL(
      ["Open Stock Timeline", "Pick a product or filter", "Read booked vs available signals"],
      ["स्टॉक टाइमलाइन खोलें", "उत्पाद चुनें या फ़िल्टर करें", "बुक बनाम उपलब्ध संकेत पढ़ें"],
    ),
    watchOuts: LL(
      ["Timeline is guidance for sales conversations, not a substitute for dispatch rules."],
      ["टाइमलाइन बिक्री बातचीत के लिए मार्गदर्शन है, डिस्पैच नियमों का विकल्प नहीं।"],
    ),
    tour: exploreTour("Stock Timeline", "स्टॉक टाइमलाइन"),
  },
  {
    id: "purchase",
    href: "/purchase",
    completionEvent: "tour.completed",
    title: L("Purchase", "खरीद"),
    goal: L("Navigate vendors, incoming, and purchase requests.", "विक्रेता, इनकमिंग और खरीद अनुरोध देखें।"),
    steps: LL(
      ["Open Purchase", "Explore vendors / incoming / requests", "Open one record detail"],
      ["खरीद खोलें", "विक्रेता / इनकमिंग / अनुरोध देखें", "एक रिकॉर्ड विवरण खोलें"],
    ),
    watchOuts: LL(
      ["Incoming lots feed inventory — practice carefully in sandbox."],
      ["इनकमिंग लॉट इन्वेंटरी में जाते हैं — सैंडबॉक्स में सावधानी से अभ्यास करें।"],
    ),
    tour: exploreTour("Purchase", "खरीद"),
  },
  {
    id: "safety-stock",
    href: "/inventory/safety-stock",
    completionEvent: "tour.completed",
    title: L("Safety Stock", "सेफ्टी स्टॉक"),
    goal: L("Understand safety stock thresholds.", "सेफ्टी स्टॉक सीमाएँ समझें।"),
    steps: LL(
      ["Open Safety Stock", "Review thresholds", "Note who maintains them"],
      ["सेफ्टी स्टॉक खोलें", "सीमाएँ देखें", "कौन बनाए रखता है नोट करें"],
    ),
    watchOuts: LL(
      ["Safety stock alerts purchase and managers — keep values realistic."],
      ["सेफ्टी स्टॉक खरीद और मैनेजर को अलर्ट करता है — मान यथार्थ रखें।"],
    ),
    tour: exploreTour("Safety Stock", "सेफ्टी स्टॉक"),
  },
  {
    id: "dispatch",
    href: "/inventory/dispatches",
    completionEvent: "tour.completed",
    title: L("Dispatch", "डिस्पैच"),
    goal: L("Learn delivery challan / dispatch workflow.", "डिलीवरी चालान / डिस्पैच वर्कफ़्लो सीखें।"),
    steps: LL(
      ["Open Dispatch", "Review list and statuses", "Open a dispatch detail"],
      ["डिस्पैच खोलें", "सूची और स्थितियाँ देखें", "डिस्पैच विवरण खोलें"],
    ),
    watchOuts: LL(
      ["Serial-tracked items need careful scanning — practice before live ops."],
      ["सीरियल ट्रैक आइटम को सावधानी से स्कैन करें — लाइव से पहले अभ्यास करें।"],
    ),
    tour: exploreTour("Dispatch", "डिस्पैच"),
  },
  {
    id: "reports",
    href: "/reports",
    completionEvent: "tour.completed",
    title: L("Reports", "रिपोर्ट्स"),
    goal: L("Know which reports your role can run.", "जानें आपके रोल कौनसी रिपोर्ट चला सकते हैं।"),
    steps: LL(
      ["Open Reports", "Pick one report", "Run with a small date range"],
      ["रिपोर्ट्स खोलें", "एक रिपोर्ट चुनें", "छोटी तिथि सीमा से चलाएँ"],
    ),
    watchOuts: LL(
      ["Practice company reports only show sandbox data."],
      ["Practice कंपनी रिपोर्ट्स में केवल सैंडबॉक्स डेटा दिखता है।"],
    ),
    tour: exploreTour("Reports", "रिपोर्ट्स"),
  },
  {
    id: "products",
    href: "/masters/products",
    completionEvent: "tour.completed",
    title: L("Products", "उत्पाद"),
    goal: L("Browse the product master used across sales and inventory.", "बिक्री और इन्वेंटरी में प्रयुक्त उत्पाद मास्टर देखें।"),
    steps: LL(
      ["Open Products", "Search or filter", "Open one product detail"],
      ["उत्पाद खोलें", "खोजें या फ़िल्टर करें", "एक उत्पाद विवरण खोलें"],
    ),
    watchOuts: LL(
      ["Product master is shared — prefer tour completion over editing in practice unless needed."],
      ["उत्पाद मास्टर साझा है — जब तक ज़रूरी न हो, अभ्यास में संपादन से बचें।"],
    ),
    tour: exploreTour("Products", "उत्पाद"),
  },
  {
    id: "pi-payments",
    href: "/accounts/payments",
    completionEvent: "tour.completed",
    title: L("PI Payments", "PI भुगतान"),
    goal: L("Record or review payments against proforma invoices.", "प्रोफॉर्मा के विरुद्ध भुगतान देखें या दर्ज करें।"),
    steps: LL(
      ["Open PI Payments", "Find a practice PI", "Review payment entry fields"],
      ["PI भुगतान खोलें", "अभ्यास PI खोजें", "भुगतान फ़ील्ड देखें"],
    ),
    watchOuts: LL(
      ["Wrong account/mode on live data causes reconciliation pain — practice first."],
      ["लाइव डेटा पर गलत खाता/मोड मिलान बिगाड़ता है — पहले अभ्यास करें।"],
    ),
    tour: exploreTour("PI Payments", "PI भुगतान"),
  },
  {
    id: "invoice-queue",
    href: "/accounts/invoice-queue",
    completionEvent: "tour.completed",
    title: L("Invoice Queue", "इनवॉइस कतार"),
    goal: L("Understand handover from ops to invoicing.", "ऑप्स से इनवॉइसिंग हैंडओवर समझें।"),
    steps: LL(
      ["Open Invoice Queue", "Review queue statuses", "Open one handover item"],
      ["इनवॉइस कतार खोलें", "कतार स्थितियाँ देखें", "एक हैंडओवर आइटम खोलें"],
    ),
    watchOuts: LL(
      ["Queue items usually follow dispatch / documentation readiness."],
      ["कतार आइटम आमतौर पर डिस्पैच / दस्तावेज़ीकरण तैयारी के बाद आते हैं।"],
    ),
    tour: exploreTour("Invoice Queue", "इनवॉइस कतार"),
  },
  {
    id: "documentation",
    href: "/documentation",
    completionEvent: "tour.completed",
    title: L("Documentation", "दस्तावेज़ीकरण"),
    goal: L("Track post-invoice documentation checklist.", "पोस्ट-इनवॉइस दस्तावेज़ चेकलिस्ट ट्रैक करें।"),
    steps: LL(
      ["Open Documentation", "Review open items", "Open one record"],
      ["दस्तावेज़ीकरण खोलें", "खुले आइटम देखें", "एक रिकॉर्ड खोलें"],
    ),
    watchOuts: LL(
      ["This is business documentation tracking — not the Help center."],
      ["यह व्यावसायिक दस्तावेज़ ट्रैकिंग है — Help केंद्र नहीं।"],
    ),
    tour: exploreTour("Documentation", "दस्तावेज़ीकरण"),
  },
  {
    id: "users",
    href: "/admin/users",
    completionEvent: "tour.completed",
    title: L("Users", "उपयोगकर्ता"),
    goal: L("Review user admin and role assignment.", "उपयोगकर्ता प्रशासन और रोल असाइनमेंट देखें।"),
    steps: LL(
      ["Open Users", "Review roles and companies", "Avoid creating real staff accounts in practice unless testing"],
      ["उपयोगकर्ता खोलें", "रोल और कंपनियाँ देखें", "जब तक टेस्ट न हो, अभ्यास में वास्तविक स्टाफ खाते न बनाएँ"],
    ),
    watchOuts: LL(
      ["User accounts are global — prefer tour completion here."],
      ["उपयोगकर्ता खाते वैश्विक हैं — यहाँ टूर पूर्ण करना बेहतर है।"],
    ),
    tour: exploreTour("Users", "उपयोगकर्ता"),
  },
  {
    id: "companies",
    href: "/admin/companies",
    completionEvent: "tour.completed",
    title: L("Companies", "कंपनियाँ"),
    goal: L("Understand company profiles and the Practice company flag.", "कंपनी प्रोफ़ाइल और Practice फ़्लैग समझें।"),
    steps: LL(
      ["Open Companies", "Identify ISE, PCMV, and Practice", "Do not turn Practice into a live company"],
      ["कंपनियाँ खोलें", "ISE, PCMV और Practice पहचानें", "Practice को लाइव कंपनी न बनाएँ"],
    ),
    watchOuts: LL(
      ["Never use Practice for real customer or tax documents."],
      ["Practice पर वास्तविक ग्राहक या कर दस्तावेज़ कभी न बनाएँ।"],
    ),
    tour: exploreTour("Companies", "कंपनियाँ"),
  },
  {
    id: "warehouses",
    href: "/admin/warehouses",
    completionEvent: "tour.completed",
    title: L("Warehouses", "गोदाम"),
    goal: L("See how warehouses map to companies.", "गोदाम कंपनियों से कैसे जुड़ते हैं देखें।"),
    steps: LL(
      ["Open Warehouses", "Filter by company", "Note Practice warehouse vs live ones"],
      ["गोदाम खोलें", "कंपनी से फ़िल्टर करें", "Practice बनाम लाइव गोदाम नोट करें"],
    ),
    watchOuts: LL(
      ["Transfers and stock are warehouse-scoped."],
      ["ट्रांसफर और स्टॉक गोदाम-स्तर पर होते हैं।"],
    ),
    tour: exploreTour("Warehouses", "गोदाम"),
  },
  {
    id: "audit-logs",
    href: "/admin/audit",
    completionEvent: "tour.completed",
    title: L("Audit Logs", "ऑडिट लॉग"),
    goal: L("Know where system audit trails live.", "सिस्टम ऑडिट ट्रेल कहाँ है जानें।"),
    steps: LL(
      ["Open Audit Logs", "Filter by table or user", "Open one log entry"],
      ["ऑडिट लॉग खोलें", "टेबल या उपयोगकर्ता से फ़िल्टर करें", "एक लॉग प्रविष्टि खोलें"],
    ),
    watchOuts: LL(
      ["Audit logs include Learning Mode actions on Practice data too."],
      ["ऑडिट लॉग में Practice डेटा पर Learning Mode क्रियाएँ भी हो सकती हैं।"],
    ),
    tour: exploreTour("Audit Logs", "ऑडिट लॉग"),
  },
];

export function getLessonById(id: string): LessonDefinition | undefined {
  return LESSONS.find((lesson) => lesson.id === id);
}

export function getLessonByHref(href: string): LessonDefinition | undefined {
  const normalized = href.replace(/\/$/, "") || "/";
  return (
    LESSONS.find((lesson) => lesson.href === normalized) ??
    LESSONS.find(
      (lesson) =>
        normalized.startsWith(`${lesson.href}/`) && lesson.href !== "/",
    )
  );
}

export function lessonsForRoles(roles: string[]): LessonDefinition[] {
  return LESSONS.filter((lesson) => {
    const nav = NAV_ITEMS.find((item) => item.href === lesson.href);
    if (!nav) return false;
    return canAccessNav(roles, nav);
  });
}

export function lessonsMatchingEvent(event: string): LessonDefinition[] {
  return LESSONS.filter((lesson) => lesson.completionEvent === event);
}

export const LEARNING_UI = {
  banner: L(
    "Learning Mode — you are on the Practice company. Exit anytime when finished.",
    "Learning Mode — आप Practice कंपनी पर हैं। समाप्त होने पर कभी भी बाहर निकलें।",
  ),
  exit: L("Exit Learning Mode", "Learning Mode से बाहर निकलें"),
  start: L("Start Learning Mode", "Learning Mode शुरू करें"),
  resume: L("Resume Learning", "सीखना जारी रखें"),
  helpTitle: L("Help & Learning", "सहायता और सीखना"),
  learnTitle: L("Your learning checklist", "आपकी सीखने की चेकलिस्ट"),
  language: L("Language", "भाषा"),
  tourComplete: L("Mark tour complete", "टूर पूर्ण चिह्नित करें"),
  startTour: L("Start tour", "टूर शुरू करें"),
  completed: L("Completed", "पूर्ण"),
  pending: L("Pending", "लंबित"),
  firstLoginTitle: L("Welcome — start Learning Mode?", "स्वागत है — Learning Mode शुरू करें?"),
  firstLoginBody: L(
    "Practice on a sandbox company with a checklist and tours for every section you can access. Real ISE/PCMV data stays untouched.",
    "सैंडबॉक्स कंपनी पर चेकलिस्ट और टूर के साथ अभ्यास करें। वास्तविक ISE/PCMV डेटा सुरक्षित रहता है।",
  ),
  firstLoginLater: L("Maybe later", "बाद में"),
  firstLoginStart: L("Start learning", "सीखना शुरू करें"),
  progressLabel: L("Progress", "प्रगति"),
  openChecklist: L("Open checklist", "चेकलिस्ट खोलें"),
  actionHint: L(
    "Complete the practice action described in the lesson, or finish the page tour for explore lessons.",
    "पाठ में वर्णित अभ्यास क्रिया पूरी करें, या एक्सप्लोर पाठों के लिए पेज टूर समाप्त करें।",
  ),
} as const;
