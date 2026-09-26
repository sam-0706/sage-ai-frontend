export const networkNodes = [
  { id: 'you', label: 'You', type: 'self', detail: 'MBA · Product & strategy' },
  { id: 'product', label: 'Product management', type: 'skill', detail: 'Target role' },
  { id: 'ai', label: 'Applied AI', type: 'skill', detail: 'High-growth skill cluster' },
  { id: 'strategy', label: 'Strategy', type: 'skill', detail: 'Core strength' },
  { id: 'fintech', label: 'Fintech founder', type: 'founder', detail: 'Operator perspective' },
  { id: 'saas', label: 'SaaS founder', type: 'founder', detail: 'Early-stage product building' },
  { id: 'mentor', label: 'Product mentor', type: 'leader', detail: 'Interview and portfolio feedback' },
  { id: 'peer', label: 'MBA peer circle', type: 'student', detail: 'Practice and referrals' },
  { id: 'case', label: 'Market-entry sprint', type: 'project', detail: 'Portfolio proof' },
  { id: 'role', label: 'APM opportunities', type: 'opportunity', detail: 'Live role cluster' },
  { id: 'workshop', label: 'Founder office hours', type: 'event', detail: 'Network entry point' },
]

export const networkLinks = [
  ['you','product'],['you','strategy'],['you','peer'],['product','ai'],['product','role'],['strategy','case'],
  ['ai','saas'],['ai','role'],['fintech','workshop'],['saas','workshop'],['workshop','you'],['mentor','product'],
  ['mentor','case'],['peer','case'],['case','role'],['fintech','role'],
].map(([source,target]) => ({ source,target }))

export const sampleJobs = [
  { title:'Associate Product Manager', company:'Growth-stage consumer platform', location:'Bengaluru', work_mode:'Hybrid', employment_type:'Full-time', salary:'Compensation listed on source', skills:['Product discovery','SQL','Analytics'], match_score:92, why_it_fits:['Matches product and strategy goal','Uses analytics and research strengths'], gaps:['Add one shipped product case study'] },
  { title:'Strategy & Operations Associate', company:'Technology venture', location:'Mumbai', work_mode:'On-site', employment_type:'Full-time', salary:null, skills:['Market research','Modelling','Stakeholder management'], match_score:88, why_it_fits:['Strong MBA strategy alignment','Mumbai preference match'], gaps:['Quantify impact in resume bullets'] },
  { title:'Product Analyst', company:'B2B software company', location:'Remote — India', work_mode:'Remote', employment_type:'Full-time', salary:null, skills:['SQL','Experimentation','Dashboards'], match_score:84, why_it_fits:['Builds toward product management','Good analytical skill overlap'], gaps:['Show experimentation evidence'] },
]
