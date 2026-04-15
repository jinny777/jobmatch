import { useState, useMemo, useCallback, useEffect, useRef } from "react";

// ─── 색상 상수 ───────────────────────────────────────────────────────────────
const C = {
  primary: "#1D4ED8", primaryLight: "#EFF6FF", primaryDark: "#1E3A8A",
  success: "#059669", successLight: "#ECFDF5",
  warning: "#D97706", warningLight: "#FFFBEB",
  danger: "#DC2626", dangerLight: "#FEF2F2",
  gray50: "#F9FAFB", gray100: "#F3F4F6", gray200: "#E5E7EB",
  gray300: "#D1D5DB", gray400: "#9CA3AF", gray500: "#6B7280",
  gray600: "#4B5563", gray700: "#374151", gray800: "#1F2937",
  white: "#FFFFFF", bg: "#F1F5F9", border: "#E2E8F0",
};

// ─── localStorage 헬퍼 ───────────────────────────────────────────────────────
const LS = {
  get: (k, d) => { try { const v = localStorage.getItem("jm_" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("jm_" + k, JSON.stringify(v)); } catch {} },
  clear: () => { Object.keys(localStorage).filter(k => k.startsWith("jm_")).forEach(k => localStorage.removeItem(k)); },
};

// ─── 스킬 온톨로지 ────────────────────────────────────────────────────────────
const SKILL_CLUSTERS = {
  "영업관리": ["세일즈", "판매관리", "거래처관리", "고객개발", "영업기획", "B2B영업", "B2C영업", "영업전략"],
  "마케팅전략": ["디지털마케팅", "브랜드관리", "캠페인기획", "마케팅기획", "광고기획", "마케팅전략"],
  "인사관리": ["HR", "채용관리", "인력운영", "노무관리", "HRBP", "인사기획", "성과관리"],
  "재무기획": ["재무전략", "재무관리", "CFO", "예산관리", "재무분석", "투자분석", "재무보고"],
  "SCM": ["공급망관리", "물류관리", "재고관리", "조달", "구매관리", "물류기획"],
  "경영기획": ["전략기획", "사업기획", "BM기획", "기획관리", "전략수립", "비즈니스분석"],
  "팀관리": ["조직관리", "인력관리", "부서관리", "리더십", "조직개발"],
  "품질관리": ["QA", "QC", "공정관리", "6시그마", "ISO인증", "테스트관리"],
  "IT인프라": ["서버관리", "네트워크", "시스템관리", "클라우드", "보안"],
  "생산관리": ["제조관리", "공장관리", "생산계획", "원가관리", "안전관리"],
};

const INDUSTRY_SIMILARITY = {
  "유통/판매": ["이커머스/물류", "외식/프랜차이즈", "화장품/뷰티"],
  "금융/보험": ["금융/IT", "IT/플랫폼"],
  "제조/화학": ["철강/제조", "식품/제조", "전자/IT", "화학/제조", "제조/산업"],
  "물류/운송": ["이커머스/물류"],
  "IT/스타트업": ["IT/플랫폼", "금융/IT", "전자/IT", "통신/IT"],
  "컨설팅": ["경영기획"],
  "교육": ["공공/기관"],
  "건설/부동산": ["공공/기관"],
};

function expandSkills(skills) {
  const expanded = [...skills];
  for (const skill of skills) {
    for (const [cluster, related] of Object.entries(SKILL_CLUSTERS)) {
      if (cluster === skill || related.includes(skill)) {
        expanded.push(cluster, ...related);
      }
    }
  }
  return [...new Set(expanded)];
}

function calcMatchScore(profile, job) {
  if (!profile?.skills?.length) return Math.floor(Math.random() * 30) + 25;
  const pSkills = expandSkills(profile.skills);
  const jSkills = job.requirements.skills;
  const matched = jSkills.filter(s => pSkills.some(p => p.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(p.toLowerCase())));
  const skillScore = jSkills.length ? (matched.length / jSkills.length) * 100 : 50;

  const userExp = profile.totalExperience || 0;
  const reqExp = job.requirements.experienceYears || 10;
  const expScore = userExp >= reqExp ? Math.min(100, 70 + (userExp - reqExp) * 2) : Math.max(20, (userExp / reqExp) * 70);

  const userInds = profile.industries || [];
  let indScore = 30;
  if (userInds.includes(job.industry)) indScore = 100;
  else for (const ind of userInds) {
    if ((INDUSTRY_SIMILARITY[ind] || []).includes(job.industry)) { indScore = 65; break; }
  }

  return Math.min(98, Math.max(15, Math.round(skillScore * 0.4 + expScore * 0.35 + indScore * 0.25)));
}

function calcMatchReasons(profile, job) {
  if (!profile?.skills?.length) return ["프로필을 완성하면 상세 매칭 이유를 확인할 수 있습니다."];
  const reasons = [];
  const pSkills = expandSkills(profile.skills);
  const matched = job.requirements.skills.filter(s => pSkills.some(p => p.toLowerCase().includes(s.toLowerCase())));
  if (matched.length) reasons.push(`보유 스킬 [${matched.slice(0, 3).join(", ")}] 이(가) 직무 요건과 일치합니다`);
  if ((profile.totalExperience || 0) >= (job.requirements.experienceYears || 0))
    reasons.push(`${job.requirements.experience} 경력 요건을 충족합니다`);
  if (profile.industries?.includes(job.industry))
    reasons.push(`${job.industry} 업계 경험이 매칭됩니다`);
  if (!reasons.length) reasons.push("기본 경력 요건 일부 충족");
  return reasons;
}

// ─── 목업 채용공고 ─────────────────────────────────────────────────────────────
const MOCK_JOBS = [
  { id:1, title:"영업본부장", company:"롯데쇼핑", companyType:"대기업", location:"서울 송파구", salary:"8,000~1억2,000만원", salaryMin:8000, salaryMax:12000, jobType:"정규직", industry:"유통/판매", description:"국내 영업 전략 수립·실행, 영업팀 관리·육성, 주요 거래처 관리를 담당할 임원급 인재를 모십니다.", responsibilities:["국내 영업 전략 수립 및 실행","영업팀 조직관리 및 인재 육성","주요 파트너사 및 거래처 관계 관리","매출 목표 달성 및 수익성 개선"], requirements:{ experience:"15년 이상", experienceYears:15, skills:["영업관리","팀관리","B2B영업","실적관리","전략기획"], education:"대졸 이상", preferred:["유통업계 경험","임원급 이상 경험"] }, deadline:"2026-04-30", postedDate:"2026-04-01", applyUrl:"#", tags:["임원급","대기업","영업관리"], isHot:true, isFeatured:true },
  { id:2, title:"인사팀장", company:"삼성화재", companyType:"대기업", location:"서울 서초구", salary:"7,000~9,500만원", salaryMin:7000, salaryMax:9500, jobType:"정규직", industry:"금융/보험", description:"인재 채용, 성과관리, 조직문화 등 전반적인 HR 업무를 총괄할 팀장을 모십니다.", responsibilities:["채용 전략 수립 및 실행","성과평가 시스템 운영 및 개선","급여/복리후생 제도 관리","조직문화 개선 프로그램 기획","노무관리 및 노사관계 유지"], requirements:{ experience:"12년 이상", experienceYears:12, skills:["채용관리","인사기획","노무관리","성과관리","조직문화"], education:"대졸 이상", preferred:["금융업 HR 경험","공인노무사"] }, deadline:"2026-05-10", postedDate:"2026-04-03", applyUrl:"#", tags:["HR","금융","팀장급"], isHot:false, isFeatured:false },
  { id:3, title:"물류운영팀장", company:"CJ대한통운", companyType:"대기업", location:"경기 군포시", salary:"6,500~8,500만원", salaryMin:6500, salaryMax:8500, jobType:"정규직", industry:"물류/운송", description:"물류센터 운영 전반을 총괄할 팀장을 모집합니다. 입출고 관리, 재고 관리, 운영 효율화를 담당합니다.", responsibilities:["물류센터 운영 전반 관리","입출고 및 재고 관리 최적화","운영 인력 관리 및 교육","물류 비용 절감 및 효율화"], requirements:{ experience:"10년 이상", experienceYears:10, skills:["물류관리","재고관리","SCM","팀관리","ERP"], education:"대졸 이상", preferred:["물류 관련 자격증","SAP 경험"] }, deadline:"2026-04-25", postedDate:"2026-03-28", applyUrl:"#", tags:["물류","운영관리","팀장급"], isHot:true, isFeatured:false },
  { id:4, title:"마케팅부장", company:"현대홈쇼핑", companyType:"대기업", location:"서울 강남구", salary:"7,500~1억원", salaryMin:7500, salaryMax:10000, jobType:"정규직", industry:"유통/판매", description:"TV/디지털 통합 마케팅 전략 수립 및 실행을 총괄할 마케팅부장을 모십니다.", responsibilities:["통합 마케팅 전략 수립 및 실행","TV·디지털·SNS 채널 마케팅 관리","브랜드 관리 및 캠페인 기획","마케팅 예산 관리 및 ROI 분석"], requirements:{ experience:"12년 이상", experienceYears:12, skills:["마케팅전략","브랜드관리","디지털마케팅","예산관리","캠페인기획"], education:"대졸 이상", preferred:["홈쇼핑/이커머스 경험","MBA"] }, deadline:"2026-05-15", postedDate:"2026-04-05", applyUrl:"#", tags:["마케팅","유통","부장급"], isHot:false, isFeatured:true },
  { id:5, title:"재무기획팀장", company:"한화솔루션", companyType:"대기업", location:"서울 중구", salary:"7,000~9,000만원", salaryMin:7000, salaryMax:9000, jobType:"정규직", industry:"제조/화학", description:"재무 계획, 예산 관리, 투자 분석 등 재무기획 전반을 담당할 팀장을 모십니다.", responsibilities:["중장기 재무 계획 수립","예산 편성 및 실적 관리","투자 분석 및 의사결정 지원","경영진 재무 보고서 작성"], requirements:{ experience:"12년 이상", experienceYears:12, skills:["재무기획","예산관리","투자분석","ERP","재무보고"], education:"대졸 이상 (경영/회계/경제)", preferred:["공인회계사(CPA)","제조업 재무 경험"] }, deadline:"2026-05-20", postedDate:"2026-04-08", applyUrl:"#", tags:["재무","기획","제조","팀장급"], isHot:false, isFeatured:false },
  { id:6, title:"고객경험(CX)팀장", company:"KT", companyType:"대기업", location:"서울 서대문구", salary:"6,500~8,500만원", salaryMin:6500, salaryMax:8500, jobType:"정규직", industry:"통신/IT", description:"고객 접점 전략 수립, 서비스 품질 관리, VOC 분석을 담당할 CX팀장을 모십니다.", responsibilities:["고객서비스 전략 수립 및 실행","서비스 품질 KPI 관리","VOC 분석 및 개선 활동","CS 인력 교육 및 관리"], requirements:{ experience:"10년 이상", experienceYears:10, skills:["고객관리","서비스기획","VOC분석","팀관리","CRM"], education:"대졸 이상", preferred:["통신업 경험"] }, deadline:"2026-04-28", postedDate:"2026-04-02", applyUrl:"#", tags:["고객서비스","통신","팀장급"], isHot:false, isFeatured:false },
  { id:7, title:"공장장", company:"오뚜기", companyType:"대기업", location:"경기 안양시", salary:"7,000~9,500만원", salaryMin:7000, salaryMax:9500, jobType:"정규직", industry:"식품/제조", description:"식품제조 공장 전반을 총괄할 공장장을 모십니다. 생산, 품질, 안전 관리를 담당합니다.", responsibilities:["공장 생산 계획 수립 및 실행","품질 및 안전 관리 총괄","생산 원가 절감 및 효율화","설비 유지 보수 관리"], requirements:{ experience:"15년 이상", experienceYears:15, skills:["생산관리","품질관리","안전관리","공정개선","원가관리"], education:"대졸 이상 (공학계열)", preferred:["식품업 경험","HACCP 경험"] }, deadline:"2026-05-31", postedDate:"2026-04-10", applyUrl:"#", tags:["제조","식품","공장관리"], isHot:false, isFeatured:false },
  { id:8, title:"교육콘텐츠 개발팀장", company:"에듀윌", companyType:"중견기업", location:"서울 구로구", salary:"5,500~7,500만원", salaryMin:5500, salaryMax:7500, jobType:"정규직", industry:"교육", description:"자격증·공무원 시험 교육 콘텐츠를 개발할 팀장을 모십니다.", responsibilities:["교육과정 커리큘럼 설계 및 개선","교재 및 온라인 콘텐츠 개발 관리","강사진 섭외 및 관리","학습자 성과 분석"], requirements:{ experience:"10년 이상", experienceYears:10, skills:["교육기획","콘텐츠개발","커리큘럼설계","팀관리","LMS"], education:"대졸 이상", preferred:["교직 경험","HRD 자격증"] }, deadline:"2026-05-10", postedDate:"2026-04-04", applyUrl:"#", tags:["교육","콘텐츠","팀장급"], isHot:false, isFeatured:false },
  { id:9, title:"구매/조달팀장", company:"포스코", companyType:"대기업", location:"경북 포항시", salary:"7,000~9,000만원", salaryMin:7000, salaryMax:9000, jobType:"정규직", industry:"철강/제조", description:"원자재 구매 및 공급망 관리를 총괄할 팀장을 모집합니다.", responsibilities:["구매 전략 수립 및 공급업체 관리","원자재 단가 협상 및 계약 관리","공급망 리스크 관리","구매 원가 절감 목표 달성"], requirements:{ experience:"12년 이상", experienceYears:12, skills:["구매관리","협상","SCM","원가관리","공급업체관리"], education:"대졸 이상", preferred:["제조업 구매 경험","영어 능통자"] }, deadline:"2026-05-25", postedDate:"2026-04-07", applyUrl:"#", tags:["구매","SCM","철강","팀장급"], isHot:false, isFeatured:false },
  { id:10, title:"브랜드 마케팅 팀장", company:"아모레퍼시픽", companyType:"대기업", location:"서울 용산구", salary:"7,000~9,000만원", salaryMin:7000, salaryMax:9000, jobType:"정규직", industry:"화장품/뷰티", description:"글로벌 브랜드 마케팅 전략을 담당할 팀장을 모십니다.", responsibilities:["브랜드 포지셔닝 전략 수립","국내외 마케팅 캠페인 기획 및 실행","신제품 런칭 마케팅 관리","마케팅 ROI 분석 및 최적화"], requirements:{ experience:"10년 이상", experienceYears:10, skills:["브랜드관리","마케팅전략","디지털마케팅","신제품기획","데이터분석"], education:"대졸 이상", preferred:["뷰티/소비재 브랜드 경험"] }, deadline:"2026-05-15", postedDate:"2026-04-06", applyUrl:"#", tags:["마케팅","브랜드","뷰티","팀장급"], isHot:true, isFeatured:false },
  { id:11, title:"IT 인프라 팀장", company:"신한은행", companyType:"대기업", location:"서울 중구", salary:"7,500~9,500만원", salaryMin:7500, salaryMax:9500, jobType:"정규직", industry:"금융/IT", description:"은행 IT 인프라를 총괄할 팀장을 모집합니다. 서버·네트워크·클라우드·보안을 담당합니다.", responsibilities:["IT 인프라 운영 및 유지보수 총괄","클라우드 전환 전략 수립 및 실행","정보보안 정책 수립 및 관리","IT 비용 최적화"], requirements:{ experience:"12년 이상", experienceYears:12, skills:["IT인프라","클라우드","네트워크","보안","팀관리"], education:"대졸 이상 (IT 관련학과)", preferred:["금융 IT 경험","AWS/Azure 자격증"] }, deadline:"2026-05-20", postedDate:"2026-04-09", applyUrl:"#", tags:["IT","인프라","금융","팀장급"], isHot:false, isFeatured:false },
  { id:12, title:"경영기획 차장/부장", company:"LS그룹", companyType:"대기업", location:"서울 강남구", salary:"6,500~9,000만원", salaryMin:6500, salaryMax:9000, jobType:"정규직", industry:"제조/전기", description:"그룹 경영기획팀에서 중장기 전략 수립 및 경영 분석을 담당할 인재를 모십니다.", responsibilities:["중장기 경영 전략 수립 지원","사업 포트폴리오 분석 및 관리","경영성과 분석 및 보고","신규 사업 타당성 검토"], requirements:{ experience:"10년 이상", experienceYears:10, skills:["경영기획","전략수립","데이터분석","재무분석","보고서작성"], education:"대졸 이상 (경영/경제 전공)", preferred:["컨설팅 경험","MBA"] }, deadline:"2026-04-30", postedDate:"2026-04-01", applyUrl:"#", tags:["경영기획","전략","대기업"], isHot:false, isFeatured:true },
  { id:13, title:"상품기획 부장", company:"GS리테일", companyType:"대기업", location:"서울 강남구", salary:"7,000~9,000만원", salaryMin:7000, salaryMax:9000, jobType:"정규직", industry:"유통/판매", description:"편의점 및 슈퍼마켓 채널의 상품기획을 담당할 부장급 인재를 모십니다.", responsibilities:["상품 포트폴리오 기획 및 관리","신상품 발굴 및 도입","상품 수익성 관리","공급업체 협상 및 관계 관리"], requirements:{ experience:"12년 이상", experienceYears:12, skills:["MD","상품기획","바이어","협상","카테고리관리"], education:"대졸 이상", preferred:["유통업 MD 경험"] }, deadline:"2026-05-05", postedDate:"2026-04-03", applyUrl:"#", tags:["MD","상품기획","유통","부장급"], isHot:false, isFeatured:false },
  { id:14, title:"총무/시설 팀장", company:"LG화학", companyType:"대기업", location:"서울 영등포구", salary:"6,000~8,000만원", salaryMin:6000, salaryMax:8000, jobType:"정규직", industry:"화학/제조", description:"사옥 관리 및 총무 업무를 총괄할 팀장을 모십니다.", responsibilities:["사옥 및 시설 관리 총괄","총무 업무 전반 관리","업무 환경 개선 프로젝트 관리","외부 용역 업체 관리 및 계약"], requirements:{ experience:"10년 이상", experienceYears:10, skills:["시설관리","총무관리","예산관리","계약관리","팀관리"], education:"대졸 이상", preferred:["대기업 총무 경험"] }, deadline:"2026-05-10", postedDate:"2026-04-05", applyUrl:"#", tags:["총무","시설관리","대기업","팀장급"], isHot:false, isFeatured:false },
  { id:15, title:"의료기기 영업 이사", company:"메드트로닉코리아", companyType:"외국계", location:"서울 강남구", salary:"1억~1억5,000만원", salaryMin:10000, salaryMax:15000, jobType:"정규직", industry:"의료/헬스케어", description:"의료기기 영업 전략을 총괄할 이사를 모십니다. 병원 네트워크 구축 및 영업조직 관리를 담당합니다.", responsibilities:["의료기기 영업 전략 수립 및 실행","주요 병원 KOL 관계 관리","영업조직 관리 및 육성","글로벌 본사와의 전략 조율"], requirements:{ experience:"15년 이상", experienceYears:15, skills:["의료기기영업","병원영업","팀관리","영업전략","KOL관리"], education:"대졸 이상 (이공계/의약계 우대)", preferred:["의료기기 업계 경험 필수","영어 능통"] }, deadline:"2026-05-30", postedDate:"2026-04-10", applyUrl:"#", tags:["의료기기","영업","외국계","임원급"], isHot:true, isFeatured:true },
  { id:16, title:"품질관리(QA) 팀장", company:"삼성전자", companyType:"대기업", location:"경기 수원시", salary:"7,500~1억원", salaryMin:7500, salaryMax:10000, jobType:"정규직", industry:"전자/IT", description:"스마트폰 제품 품질관리를 총괄할 팀장을 모집합니다.", responsibilities:["제품 품질 기준 설정 및 관리","품질 이슈 분석 및 개선 활동","글로벌 품질 인증 관리","품질팀 관리 및 육성"], requirements:{ experience:"12년 이상", experienceYears:12, skills:["품질관리","6시그마","공정관리","테스트관리","ISO인증"], education:"대졸 이상 (공학계열)", preferred:["전자제품 QA 경험","6시그마 블랙벨트"] }, deadline:"2026-05-15", postedDate:"2026-04-06", applyUrl:"#", tags:["품질관리","전자","대기업","팀장급"], isHot:false, isFeatured:false },
  { id:17, title:"전략 컨설턴트 (시니어)", company:"딜로이트컨설팅", companyType:"외국계", location:"서울 강남구", salary:"8,000~1억2,000만원", salaryMin:8000, salaryMax:12000, jobType:"정규직", industry:"컨설팅", description:"기업 경영전략 컨설팅을 담당할 시니어 컨설턴트를 모십니다.", responsibilities:["경영 전략 컨설팅 프로젝트 수행","산업 분석 및 전략 보고서 작성","클라이언트 임원진 프레젠테이션","주니어 컨설턴트 멘토링"], requirements:{ experience:"8년 이상", experienceYears:8, skills:["전략컨설팅","비즈니스분석","프레젠테이션","데이터분석","프로젝트관리"], education:"대학원 이상 (MBA 우대)", preferred:["4대 컨설팅펌 경험"] }, deadline:"2026-06-01", postedDate:"2026-04-10", applyUrl:"#", tags:["컨설팅","전략","외국계","시니어"], isHot:true, isFeatured:false },
  { id:18, title:"SCM 물류기획 부장", company:"쿠팡", companyType:"대기업", location:"서울 송파구", salary:"8,000~1억1,000만원", salaryMin:8000, salaryMax:11000, jobType:"정규직", industry:"이커머스/물류", description:"풀필먼트 네트워크 최적화를 담당할 물류기획 부장을 모십니다.", responsibilities:["물류 네트워크 최적화 기획","배송 프로세스 개선 및 효율화","물류 데이터 분석 및 인사이트 도출","신규 물류 시스템 도입 기획"], requirements:{ experience:"12년 이상", experienceYears:12, skills:["SCM","물류기획","데이터분석","프로세스개선","프로젝트관리"], education:"대졸 이상", preferred:["이커머스 물류 경험","ERP/WMS 경험"] }, deadline:"2026-05-20", postedDate:"2026-04-08", applyUrl:"#", tags:["SCM","물류","이커머스","부장급"], isHot:true, isFeatured:false },
  { id:19, title:"보험심사 팀장", company:"메리츠화재", companyType:"대기업", location:"서울 강남구", salary:"6,500~8,500만원", salaryMin:6500, salaryMax:8500, jobType:"정규직", industry:"금융/보험", description:"보험 언더라이팅 및 심사를 총괄할 팀장을 모십니다.", responsibilities:["보험 심사 기준 수립 및 관리","대형 계약 언더라이팅","심사 프로세스 개선","심사팀 관리 및 교육"], requirements:{ experience:"12년 이상", experienceYears:12, skills:["보험심사","언더라이팅","리스크관리","팀관리","손해보험"], education:"대졸 이상", preferred:["보험계리사 또는 손해사정사"] }, deadline:"2026-05-10", postedDate:"2026-04-04", applyUrl:"#", tags:["보험","심사","금융","팀장급"], isHot:false, isFeatured:false },
  { id:20, title:"CFO (재무이사)", company:"테크스타트업 (코스닥 준비)", companyType:"스타트업", location:"서울 강남구", salary:"8,000~1억2,000만원", salaryMin:8000, salaryMax:12000, jobType:"정규직", industry:"IT/스타트업", description:"코스닥 IPO를 준비 중인 IT 스타트업의 CFO를 모십니다. 재무 전략, IR, 자금 조달을 총괄합니다.", responsibilities:["재무 전략 수립 및 집행","IPO 준비 및 IR 활동","자금 조달 (VC, PE, 은행)","재무제표 작성 및 외부 감사 관리"], requirements:{ experience:"15년 이상", experienceYears:15, skills:["재무전략","IPO","자금조달","IR","재무보고"], education:"대졸 이상", preferred:["공인회계사 필수","IPO 경험"] }, deadline:"2026-05-15", postedDate:"2026-04-07", applyUrl:"#", tags:["CFO","IPO","스타트업","임원급"], isHot:true, isFeatured:true },
  { id:21, title:"HR 파트너 (HRBP)", company:"카카오", companyType:"대기업", location:"경기 성남시", salary:"7,000~9,500만원", salaryMin:7000, salaryMax:9500, jobType:"정규직", industry:"IT/플랫폼", description:"비즈니스 파트너로서 HR 전략을 수립하고 실행할 HRBP를 모십니다.", responsibilities:["비즈니스 부서별 HR 전략 수립 및 지원","조직 진단 및 조직 설계","인재 개발 및 유지 전략","성과 관리 시스템 운영"], requirements:{ experience:"10년 이상", experienceYears:10, skills:["HRBP","조직개발","인재개발","성과관리","채용"], education:"대졸 이상", preferred:["IT업계 HR 경험","OD 전문성"] }, deadline:"2026-05-20", postedDate:"2026-04-09", applyUrl:"#", tags:["HR","HRBP","IT","대기업"], isHot:true, isFeatured:false },
  { id:22, title:"부동산개발 팀장", company:"GS건설", companyType:"대기업", location:"서울 강남구", salary:"7,000~9,500만원", salaryMin:7000, salaryMax:9500, jobType:"정규직", industry:"건설/부동산", description:"주거/상업용 부동산 개발 사업을 총괄할 팀장을 모십니다.", responsibilities:["개발 사업 발굴 및 사업성 검토","인허가 및 행정 절차 관리","시행사/시공사 협력 관계 관리","사업비 관리 및 수익성 분석"], requirements:{ experience:"12년 이상", experienceYears:12, skills:["부동산개발","사업기획","인허가","수익성분석","프로젝트관리"], education:"대졸 이상", preferred:["시행/시공 경험","공인중개사"] }, deadline:"2026-05-25", postedDate:"2026-04-10", applyUrl:"#", tags:["부동산","개발","건설","팀장급"], isHot:false, isFeatured:false },
  { id:23, title:"프랜차이즈 사업부장", company:"이디야커피", companyType:"중견기업", location:"서울 영등포구", salary:"6,500~8,500만원", salaryMin:6500, salaryMax:8500, jobType:"정규직", industry:"외식/프랜차이즈", description:"전국 가맹점 관리 및 신규 출점 전략을 담당할 사업부장을 모십니다.", responsibilities:["가맹점 운영 지원 및 관리","신규 출점 전략 수립","가맹점 매출 증대 방안 기획","점주 교육 프로그램 운영"], requirements:{ experience:"10년 이상", experienceYears:10, skills:["프랜차이즈","가맹점관리","영업관리","외식업","점포개발"], education:"대졸 이상", preferred:["프랜차이즈 업계 경험"] }, deadline:"2026-05-15", postedDate:"2026-04-06", applyUrl:"#", tags:["프랜차이즈","외식","영업","부장급"], isHot:false, isFeatured:false },
  { id:24, title:"경영지원 팀장", company:"중견 제조기업 (비공개)", companyType:"중견기업", location:"인천 남동구", salary:"5,500~7,500만원", salaryMin:5500, salaryMax:7500, jobType:"정규직", industry:"제조/산업", description:"경영지원 전반(총무, 인사, 법무, 구매)을 총괄할 팀장을 모집합니다.", responsibilities:["인사/총무/경리 업무 총괄","계약서 및 법무 업무 관리","사무용품 및 비품 구매 관리","직원 복리후생 제도 운영"], requirements:{ experience:"10년 이상", experienceYears:10, skills:["경영지원","인사관리","총무관리","법무","팀관리"], education:"대졸 이상", preferred:["제조업 경영지원 경험"] }, deadline:"2026-04-28", postedDate:"2026-04-01", applyUrl:"#", tags:["경영지원","총무","인사","팀장급"], isHot:false, isFeatured:false },
  { id:25, title:"공공기관 경영기획 과장", company:"서울도시주택공사", companyType:"공공기관", location:"서울 노원구", salary:"5,000~7,000만원", salaryMin:5000, salaryMax:7000, jobType:"정규직", industry:"공공/기관", description:"SH공사 경영기획 업무를 담당할 경력직을 모집합니다.", responsibilities:["연간 경영계획 수립 및 관리","경영실적 분석 및 보고","예산 편성 및 집행 관리","기관 평가 대응 업무"], requirements:{ experience:"8년 이상", experienceYears:8, skills:["경영기획","예산관리","보고서작성","데이터분석","행정"], education:"대졸 이상", preferred:["공공기관 경험"] }, deadline:"2026-04-25", postedDate:"2026-03-30", applyUrl:"#", tags:["공공기관","경영기획","안정적"], isHot:false, isFeatured:false },
];

const ALL_SKILLS = ["영업관리", "B2B영업", "B2C영업", "영업전략", "거래처관리", "마케팅전략", "디지털마케팅", "브랜드관리", "캠페인기획", "SNS마케팅", "인사관리", "채용관리", "노무관리", "성과관리", "HRBP", "조직개발", "재무기획", "예산관리", "투자분석", "재무전략", "IPO", "자금조달", "SCM", "물류관리", "재고관리", "구매관리", "생산관리", "품질관리", "안전관리", "공정개선", "경영기획", "전략수립", "사업기획", "데이터분석", "프로젝트관리", "팀관리", "리더십", "보고서작성", "IT인프라", "클라우드", "전략컨설팅", "교육기획", "콘텐츠개발", "부동산개발", "보험심사", "고객관리", "CRM", "협상", "원가관리", "총무관리", "시설관리"];
const ALL_INDUSTRIES = ["유통/판매", "금융/보험", "제조/화학", "물류/운송", "IT/스타트업", "IT/플랫폼", "금융/IT", "전자/IT", "통신/IT", "식품/제조", "철강/제조", "화학/제조", "화장품/뷰티", "교육", "의료/헬스케어", "컨설팅", "건설/부동산", "외식/프랜차이즈", "이커머스/물류", "공공/기관", "제조/산업", "제조/전기"];
const LOCATIONS = ["서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주", "재택/원격"];

// ─── 날짜 헬퍼 ────────────────────────────────────────────────────────────────
function daysUntil(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  d.setHours(0,0,0,0); now.setHours(0,0,0,0);
  return Math.ceil((d - now) / 86400000);
}
function fmtDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

// ─── UI 기본 컴포넌트 ─────────────────────────────────────────────────────────
function Btn({ children, variant="primary", size="md", onClick, style={}, disabled=false }) {
  const base = { border:"none", borderRadius:8, cursor:disabled?"not-allowed":"pointer", fontWeight:600, transition:"all 0.15s", opacity:disabled?0.5:1 };
  const variants = {
    primary: { background:C.primary, color:C.white },
    secondary: { background:C.white, color:C.primary, border:`1.5px solid ${C.primary}` },
    ghost: { background:"transparent", color:C.gray600, border:`1.5px solid ${C.border}` },
    danger: { background:C.danger, color:C.white },
    success: { background:C.success, color:C.white },
  };
  const sizes = { sm:{padding:"6px 12px",fontSize:13}, md:{padding:"10px 20px",fontSize:14}, lg:{padding:"14px 28px",fontSize:16} };
  return <button disabled={disabled} onClick={onClick} style={{...base,...variants[variant],...sizes[size],...style}}>{children}</button>;
}

function Tag({ children, color="gray" }) {
  const colors = {
    gray: { bg:C.gray100, text:C.gray600 },
    blue: { bg:C.primaryLight, text:C.primary },
    green: { bg:C.successLight, text:C.success },
    amber: { bg:C.warningLight, text:C.warning },
    red: { bg:C.dangerLight, text:C.danger },
  };
  const col = colors[color] || colors.gray;
  return <span style={{ background:col.bg, color:col.text, padding:"3px 10px", borderRadius:20, fontSize:12, fontWeight:600 }}>{children}</span>;
}

function ScoreBadge({ score, size="md" }) {
  const color = score >= 80 ? C.success : score >= 60 ? C.primary : score >= 40 ? C.warning : C.gray400;
  const bg = score >= 80 ? C.successLight : score >= 60 ? C.primaryLight : score >= 40 ? C.warningLight : C.gray100;
  const sz = size === "lg" ? { width:60, height:60, fontSize:20 } : { width:44, height:44, fontSize:15 };
  return (
    <div style={{ ...sz, borderRadius:"50%", background:bg, color, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, border:`2px solid ${color}` }}>
      {score}
    </div>
  );
}

function DeadlineBadge({ deadline }) {
  const days = daysUntil(deadline);
  if (days < 0) return <Tag color="gray">마감</Tag>;
  if (days === 0) return <Tag color="red">오늘 마감</Tag>;
  if (days <= 3) return <Tag color="red">D-{days}</Tag>;
  if (days <= 7) return <Tag color="amber">D-{days}</Tag>;
  return <Tag color="gray">{fmtDate(deadline)} 마감</Tag>;
}

function Input({ label, value, onChange, placeholder, type="text", style={} }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {label && <label style={{ fontSize:14, fontWeight:600, color:C.gray700 }}>{label}</label>}
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ padding:"10px 14px", border:`1.5px solid ${C.border}`, borderRadius:8, fontSize:15, color:C.gray800, outline:"none", ...style }}
        onFocus={e => e.target.style.borderColor = C.primary}
        onBlur={e => e.target.style.borderColor = C.border}
      />
    </div>
  );
}

function Select({ label, value, onChange, options, style={} }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {label && <label style={{ fontSize:14, fontWeight:600, color:C.gray700 }}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding:"10px 14px", border:`1.5px solid ${C.border}`, borderRadius:8, fontSize:15, color:C.gray800, outline:"none", background:C.white, ...style }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Card({ children, style={}, onClick }) {
  return (
    <div onClick={onClick} style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, padding:20, boxShadow:"0 1px 3px rgba(0,0,0,0.06)", cursor:onClick?"pointer":"default", transition:"box-shadow 0.15s", ...style }}
      onMouseEnter={e => onClick && (e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,0.1)")}
      onMouseLeave={e => onClick && (e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,0.06)")}>
      {children}
    </div>
  );
}

function Modal({ children, onClose, title, width=600 }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:C.white, borderRadius:16, width:"100%", maxWidth:width, maxHeight:"90vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding:"20px 24px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, background:C.white, zIndex:1 }}>
          <h3 style={{ margin:0, fontSize:18, fontWeight:700, color:C.gray800 }}>{title}</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:24, color:C.gray400, lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:24 }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Toast 알림 ──────────────────────────────────────────────────────────────
function ToastContainer({ toasts, onRemove }) {
  return (
    <div style={{ position:"fixed", bottom:24, right:24, zIndex:2000, display:"flex", flexDirection:"column", gap:8, pointerEvents:"none" }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background:t.type==="success"?C.success:t.type==="error"?C.danger:C.gray800, color:C.white, padding:"12px 18px", borderRadius:10, fontSize:14, fontWeight:600, boxShadow:"0 4px 16px rgba(0,0,0,0.2)", display:"flex", alignItems:"center", gap:10, minWidth:240, pointerEvents:"all", animation:"slideIn 0.2s ease" }}>
          <span>{t.type==="success"?"✅":t.type==="error"?"❌":"ℹ️"}</span>
          <span style={{ flex:1 }}>{t.message}</span>
          <button onClick={()=>onRemove(t.id)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.7)", cursor:"pointer", fontSize:16, lineHeight:1, padding:0 }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ─── 경력 재해석 데이터 ────────────────────────────────────────────────────────
const CAREER_PIVOTS = {
  "영업관리": [
    { role:"CRM 전략 매니저", reason:"고객 관계 관리 경험 활용", match:88 },
    { role:"사업개발 이사", reason:"B2B 네트워크 및 협상력 활용", match:85 },
    { role:"채널 파트너 관리", reason:"영업 채널 운영 경험 전환", match:80 },
  ],
  "인사관리": [
    { role:"조직개발 컨설턴트", reason:"HR 기획 및 조직문화 전문성", match:87 },
    { role:"HR Tech 기획자", reason:"인사 시스템 디지털 전환 수요", match:79 },
    { role:"기업문화 전문가", reason:"조직 진단 및 변화관리 경험", match:76 },
  ],
  "재무기획": [
    { role:"CFO (스타트업)", reason:"재무 전략 경험의 스타트업 수요 높음", match:90 },
    { role:"투자심사역", reason:"재무 분석 및 사업성 검토 전문성", match:82 },
    { role:"경영기획 임원", reason:"재무 + 전략 융합 포지션", match:84 },
  ],
  "SCM": [
    { role:"이커머스 물류기획", reason:"SCM 경험의 이커머스 수요 급증", match:86 },
    { role:"공급망 컨설턴트", reason:"제조/유통 SCM 전문성 활용", match:81 },
    { role:"물류 스타트업 COO", reason:"물류 운영 전반 경험 활용", match:78 },
  ],
  "경영기획": [
    { role:"전략 컨설턴트", reason:"기획 및 분석 능력 컨설팅 분야 활용", match:85 },
    { role:"투자심사역 (CVC)", reason:"사업 분석 및 포트폴리오 관리", match:80 },
    { role:"신사업 기획 임원", reason:"중장기 전략 수립 경험 전환", match:83 },
  ],
  "마케팅전략": [
    { role:"브랜드 전략 디렉터", reason:"브랜드 관리 및 마케팅 전략 통합", match:88 },
    { role:"그로스 마케터", reason:"디지털 전환 시대 마케팅 역량", match:77 },
    { role:"CMO (중견기업)", reason:"마케팅 총괄 경험 임원급 수요", match:85 },
  ],
  "생산관리": [
    { role:"스마트팩토리 컨설턴트", reason:"제조 현장 경험 + 디지털 전환", match:82 },
    { role:"품질경영 전문위원", reason:"생산·품질 통합 관리 경험", match:80 },
    { role:"제조 스타트업 COO", reason:"공장 운영 전반 경험 활용", match:78 },
  ],
  "default": [
    { role:"경영지원 임원", reason:"다양한 관리 경험의 종합적 활용", match:75 },
    { role:"중소기업 컨설턴트", reason:"업계 경험 기반 자문 역할", match:72 },
    { role:"사회적기업 경영진", reason:"경력 전환 후 사회 기여형 커리어", match:70 },
  ],
};

function getCareerPivots(skills) {
  if (!skills?.length) return CAREER_PIVOTS.default;
  for (const skill of skills) {
    for (const [key, pivots] of Object.entries(CAREER_PIVOTS)) {
      if (key !== "default" && skill.includes(key.slice(0,3))) return pivots;
    }
    if (CAREER_PIVOTS[skill]) return CAREER_PIVOTS[skill];
  }
  return CAREER_PIVOTS.default;
}

// ─── 로그인 페이지 ─────────────────────────────────────────────────────────────
function LoginPage({ onDemoLogin }) {
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 50%, #0EA5E9 100%)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:32, width:"100%", maxWidth:440 }}>
        {/* 로고 */}
        <div style={{ textAlign:"center", color:C.white }}>
          <div style={{ fontSize:48, marginBottom:8 }}>🎯</div>
          <h1 style={{ margin:0, fontSize:32, fontWeight:800, letterSpacing:-1 }}>MidCareer Match AI</h1>
          <p style={{ margin:"8px 0 0", fontSize:16, opacity:0.85, lineHeight:1.5 }}>중장년의 경력을 이해하고, 가장 적합한 일자리까지<br/>자동으로 연결해주는 AI 취업 매니저</p>
        </div>
        {/* 카드 */}
        <div style={{ background:C.white, borderRadius:20, padding:36, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
          <h2 style={{ margin:"0 0 24px", fontSize:22, fontWeight:700, color:C.gray800, textAlign:"center" }}>시작하기</h2>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <button onClick={onDemoLogin} style={{ padding:"14px", background:C.primary, color:C.white, border:"none", borderRadius:10, fontSize:16, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              <span>🚀</span> 데모로 시작하기
            </button>
            <button style={{ padding:"14px", background:C.white, color:C.gray600, border:`1.5px solid ${C.border}`, borderRadius:10, fontSize:16, fontWeight:600, cursor:"not-allowed", display:"flex", alignItems:"center", justifyContent:"center", gap:8, opacity:0.6 }}>
              <span>🔑</span> Google 로그인 (준비 중)
            </button>
          </div>
          <p style={{ margin:"20px 0 0", fontSize:13, color:C.gray400, textAlign:"center" }}>
            데모 모드에서는 모든 기능을 체험할 수 있습니다.<br/>데이터는 브라우저에 저장됩니다.
          </p>
        </div>
        {/* 특징 */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, width:"100%" }}>
          {[["🤖","AI 경력 매칭","단순 키워드가 아닌 경력 기반 매칭"],["📋","채용공고 수집","주요 플랫폼 공고 자동 수집"],["📅","마감일 캘린더","지원 일정 자동 관리"],["🎯","원클릭 지원","바로 지원 페이지 연결"]].map(([icon,title,desc]) => (
            <div key={title} style={{ background:"rgba(255,255,255,0.12)", borderRadius:12, padding:"14px 16px", backdropFilter:"blur(10px)" }}>
              <div style={{ fontSize:24, marginBottom:4 }}>{icon}</div>
              <div style={{ color:C.white, fontWeight:700, fontSize:14 }}>{title}</div>
              <div style={{ color:"rgba(255,255,255,0.75)", fontSize:12, marginTop:2 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 온보딩 페이지 ────────────────────────────────────────────────────────────
function OnboardingPage({ user, onComplete }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: user?.name || "", ageRange: "40대", location: "서울",
    currentJob: "", currentCompany: "", currentIndustry: ALL_INDUSTRIES[0],
    totalExperience: 15,
    skills: [],
    industries: [],
    desiredJob: "", desiredSalaryMin: 6000, desiredLocation: "서울", desiredJobType: "정규직",
  });
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleSkill = s => up("skills", form.skills.includes(s) ? form.skills.filter(x=>x!==s) : [...form.skills, s]);
  const toggleInd = i => up("industries", form.industries.includes(i) ? form.industries.filter(x=>x!==i) : [...form.industries, i]);

  const steps = ["기본 정보", "경력 정보", "보유 스킬", "희망 조건"];

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:C.white, borderRadius:20, padding:40, width:"100%", maxWidth:560, boxShadow:"0 4px 24px rgba(0,0,0,0.08)" }}>
        {/* 진행바 */}
        <div style={{ marginBottom:32 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            {steps.map((s,i) => (
              <div key={s} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, flex:1 }}>
                <div style={{ width:28, height:28, borderRadius:"50%", background:i+1<=step?C.primary:C.gray200, color:i+1<=step?C.white:C.gray400, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700 }}>{i+1<=step?"✓":i+1}</div>
                <span style={{ fontSize:11, color:i+1===step?C.primary:C.gray400, fontWeight:i+1===step?700:400 }}>{s}</span>
              </div>
            ))}
          </div>
          <div style={{ height:4, background:C.gray100, borderRadius:2, overflow:"hidden" }}>
            <div style={{ height:"100%", background:C.primary, width:`${((step-1)/3)*100}%`, transition:"width 0.3s" }} />
          </div>
        </div>

        {step === 1 && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:C.gray800 }}>안녕하세요! 기본 정보를 입력해 주세요</h2>
            <Input label="이름" value={form.name} onChange={v=>up("name",v)} placeholder="홍길동" />
            <Select label="연령대" value={form.ageRange} onChange={v=>up("ageRange",v)} options={["40대 초반","40대","50대 초반","50대","60대 초반","60대"].map(v=>({value:v,label:v}))} />
            <Select label="거주 지역" value={form.location} onChange={v=>up("location",v)} options={LOCATIONS.map(v=>({value:v,label:v}))} />
          </div>
        )}

        {step === 2 && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:C.gray800 }}>경력 정보를 입력해 주세요</h2>
            <Input label="최근 직무 (현재 or 마지막 직무)" value={form.currentJob} onChange={v=>up("currentJob",v)} placeholder="예: 영업팀장, 인사부장" />
            <Input label="최근 회사명" value={form.currentCompany} onChange={v=>up("currentCompany",v)} placeholder="예: 삼성전자" />
            <Select label="주요 업종" value={form.currentIndustry} onChange={v=>up("currentIndustry",v)} options={ALL_INDUSTRIES.map(v=>({value:v,label:v}))} />
            <div>
              <label style={{ fontSize:14, fontWeight:600, color:C.gray700 }}>총 경력 연수: <span style={{ color:C.primary }}>{form.totalExperience}년</span></label>
              <input type="range" min={1} max={40} value={form.totalExperience} onChange={e=>up("totalExperience",+e.target.value)}
                style={{ width:"100%", marginTop:8, accentColor:C.primary }} />
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.gray400 }}><span>1년</span><span>40년</span></div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:C.gray800 }}>보유 스킬을 선택해 주세요</h2>
            <p style={{ margin:0, color:C.gray500, fontSize:14 }}>해당하는 스킬을 모두 선택하세요 ({form.skills.length}개 선택됨)</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {ALL_SKILLS.map(s => (
                <button key={s} onClick={()=>toggleSkill(s)} style={{ padding:"7px 14px", borderRadius:20, border:`1.5px solid ${form.skills.includes(s)?C.primary:C.border}`, background:form.skills.includes(s)?C.primaryLight:C.white, color:form.skills.includes(s)?C.primary:C.gray600, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  {form.skills.includes(s) ? "✓ " : ""}{s}
                </button>
              ))}
            </div>
            <div>
              <label style={{ fontSize:14, fontWeight:600, color:C.gray700, display:"block", marginBottom:8 }}>경험 업종 (중복 선택 가능)</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {ALL_INDUSTRIES.map(i => (
                  <button key={i} onClick={()=>toggleInd(i)} style={{ padding:"6px 12px", borderRadius:20, border:`1.5px solid ${form.industries.includes(i)?C.success:C.border}`, background:form.industries.includes(i)?C.successLight:C.white, color:form.industries.includes(i)?C.success:C.gray600, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:C.gray800 }}>희망 근무 조건을 입력해 주세요</h2>
            <Input label="희망 직무" value={form.desiredJob} onChange={v=>up("desiredJob",v)} placeholder="예: 영업본부장, HR팀장" />
            <div>
              <label style={{ fontSize:14, fontWeight:600, color:C.gray700 }}>희망 연봉 (최소): <span style={{ color:C.primary }}>{form.desiredSalaryMin.toLocaleString()}만원</span></label>
              <input type="range" min={3000} max={15000} step={500} value={form.desiredSalaryMin} onChange={e=>up("desiredSalaryMin",+e.target.value)} style={{ width:"100%", marginTop:8, accentColor:C.primary }} />
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.gray400 }}><span>3,000만원</span><span>1억 5,000만원</span></div>
            </div>
            <Select label="희망 근무 지역" value={form.desiredLocation} onChange={v=>up("desiredLocation",v)} options={["무관",...LOCATIONS].map(v=>({value:v,label:v}))} />
            <Select label="희망 고용 형태" value={form.desiredJobType} onChange={v=>up("desiredJobType",v)} options={["정규직","계약직","프리랜서","파견직","무관"].map(v=>({value:v,label:v}))} />
          </div>
        )}

        <div style={{ display:"flex", justifyContent:"space-between", marginTop:32 }}>
          <Btn variant="ghost" onClick={() => step > 1 ? setStep(s=>s-1) : null} style={{ visibility:step===1?"hidden":"visible" }}>← 이전</Btn>
          {step < 4
            ? <Btn onClick={() => setStep(s=>s+1)} disabled={step===1 && !form.name}>다음 →</Btn>
            : <Btn onClick={() => onComplete({ ...form, industries: form.industries.length ? form.industries : [form.currentIndustry] })}>AI 매칭 시작 🎯</Btn>
          }
        </div>
      </div>
    </div>
  );
}

// ─── 직무 카드 컴포넌트 ────────────────────────────────────────────────────────
function JobCard({ job, isSaved, onSave, onSelect }) {
  return (
    <Card onClick={() => onSelect(job)} style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
            {job.isHot && <Tag color="red">🔥 인기</Tag>}
            {job.isFeatured && <Tag color="blue">⭐ 추천</Tag>}
            <Tag color="gray">{job.companyType}</Tag>
          </div>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:C.gray800, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.title}</h3>
          <p style={{ margin:"4px 0 0", fontSize:14, color:C.gray500 }}>{job.company}</p>
        </div>
        <ScoreBadge score={job.matchScore} />
      </div>

      <div style={{ display:"flex", gap:16, fontSize:13, color:C.gray500 }}>
        <span>📍 {job.location}</span>
        <span>💰 {job.salary}</span>
        <span>🏢 {job.industry}</span>
      </div>

      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {job.requirements.skills.slice(0,4).map(s => <Tag key={s}>{s}</Tag>)}
        {job.requirements.skills.length > 4 && <Tag>+{job.requirements.skills.length-4}</Tag>}
      </div>

      {job.matchReasons?.[0] && (
        <div style={{ background:C.primaryLight, borderRadius:8, padding:"8px 12px", fontSize:13, color:C.primary }}>
          💡 {job.matchReasons[0]}
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
        <DeadlineBadge deadline={job.deadline} />
        <div style={{ display:"flex", gap:8 }}>
          <Btn variant="ghost" size="sm" onClick={e => { e.stopPropagation(); onSave(job); }}>
            {isSaved ? "★ 저장됨" : "☆ 저장"}
          </Btn>
          <Btn size="sm" onClick={e => { e.stopPropagation(); onSelect(job); }}>자세히 보기</Btn>
        </div>
      </div>
    </Card>
  );
}

// ─── 직무 상세 모달 ───────────────────────────────────────────────────────────
function ApplyModal({ job, onClose, onConfirm }) {
  const resume = LS.get("resume", null);
  return (
    <Modal title="지원하기" onClose={onClose} width={480}>
      <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
        <div style={{ background:C.primaryLight, borderRadius:12, padding:16 }}>
          <div style={{ fontSize:16, fontWeight:700, color:C.gray800 }}>{job.title}</div>
          <div style={{ fontSize:14, color:C.gray500, marginTop:4 }}>{job.company} · {job.location}</div>
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:C.gray700, marginBottom:8 }}>첨부 이력서</div>
          {resume ? (
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:C.successLight, borderRadius:8, border:`1px solid ${C.success}` }}>
              <span style={{ fontSize:20 }}>📄</span>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:C.gray700 }}>{resume.name}</div>
                <div style={{ fontSize:12, color:C.gray500 }}>{resume.size} · {resume.uploadedAt}</div>
              </div>
              <Tag color="green" style={{ marginLeft:"auto" }}>선택됨</Tag>
            </div>
          ) : (
            <div style={{ padding:"12px 14px", background:C.warningLight, borderRadius:8, border:`1px solid ${C.warning}`, fontSize:13, color:C.warning }}>
              ⚠️ 등록된 이력서가 없습니다. 프로필에서 이력서를 업로드해 주세요.
            </div>
          )}
        </div>
        <div style={{ fontSize:13, color:C.gray500, background:C.gray50, borderRadius:8, padding:"10px 14px" }}>
          📌 지원 후 저장 공고의 상태가 <strong>"지원함"</strong>으로 변경됩니다.
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>취소</Btn>
          <Btn onClick={onConfirm} style={{ flex:2 }}>지원하기 →</Btn>
        </div>
      </div>
    </Modal>
  );
}

function JobDetailModal({ job, profile, isSaved, onSave, onClose, onApply }) {
  const [showApply, setShowApply] = useState(false);
  const skillMatched = job.requirements.skills.filter(s => expandSkills(profile?.skills||[]).some(p => p.toLowerCase().includes(s.toLowerCase())));
  const skillTotal = job.requirements.skills.length;
  const expOk = (profile?.totalExperience||0) >= (job.requirements.experienceYears||0);

  return (
    <>
    {showApply && (
      <ApplyModal
        job={job}
        onClose={() => setShowApply(false)}
        onConfirm={() => { setShowApply(false); onApply(job); onClose(); }}
      />
    )}
    <Modal title={job.title} onClose={onClose} width={680}>
      <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
        {/* 헤더 정보 */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" }}>
              {job.isHot && <Tag color="red">🔥 인기</Tag>}
              <Tag color="gray">{job.companyType}</Tag>
              <Tag color="blue">{job.industry}</Tag>
            </div>
            <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:C.gray800 }}>{job.title}</h2>
            <p style={{ margin:"6px 0 0", fontSize:16, color:C.gray500 }}>{job.company}</p>
          </div>
          <ScoreBadge score={job.matchScore} size="lg" />
        </div>

        {/* 기본 정보 */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {[["📍 위치",job.location],["💰 연봉",job.salary],["⏰ 경력",job.requirements.experience],["📋 고용형태",job.jobType],["📅 마감일",fmtDate(job.deadline)],["📌 게시일",fmtDate(job.postedDate)]].map(([k,v]) => (
            <div key={k} style={{ background:C.gray50, borderRadius:8, padding:"10px 14px" }}>
              <div style={{ fontSize:12, color:C.gray400, marginBottom:2 }}>{k}</div>
              <div style={{ fontSize:14, fontWeight:600, color:C.gray700 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* AI 매칭 분석 */}
        <div style={{ background:C.primaryLight, borderRadius:12, padding:20 }}>
          <h4 style={{ margin:"0 0 16px", fontSize:15, fontWeight:700, color:C.primary }}>🤖 AI 매칭 분석</h4>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
                <span style={{ color:C.gray700, fontWeight:600 }}>스킬 매칭</span>
                <span style={{ color:C.primary, fontWeight:700 }}>{skillMatched.length}/{skillTotal}개 일치</span>
              </div>
              <div style={{ height:8, background:"rgba(255,255,255,0.5)", borderRadius:4, overflow:"hidden" }}>
                <div style={{ height:"100%", background:C.primary, width:`${skillTotal?skillMatched.length/skillTotal*100:0}%`, borderRadius:4 }} />
              </div>
              {skillMatched.length > 0 && <div style={{ fontSize:12, color:C.primary, marginTop:4 }}>일치: {skillMatched.join(", ")}</div>}
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 14px", background:C.white, borderRadius:8 }}>
              <span style={{ fontSize:13, color:C.gray700 }}>경력 요건 충족</span>
              <span style={{ fontSize:13, fontWeight:700, color:expOk?C.success:C.warning }}>{expOk?"✅ 충족":"⚠️ 미달"}</span>
            </div>
            {job.matchReasons?.map((r,i) => <div key={i} style={{ fontSize:13, color:C.primary, display:"flex", gap:6 }}><span>•</span>{r}</div>)}
          </div>
        </div>

        {/* 직무 설명 */}
        <div>
          <h4 style={{ margin:"0 0 10px", fontSize:15, fontWeight:700, color:C.gray800 }}>직무 소개</h4>
          <p style={{ margin:0, fontSize:14, color:C.gray600, lineHeight:1.7 }}>{job.description}</p>
        </div>

        {/* 주요 업무 */}
        <div>
          <h4 style={{ margin:"0 0 10px", fontSize:15, fontWeight:700, color:C.gray800 }}>주요 업무</h4>
          <ul style={{ margin:0, padding:"0 0 0 18px" }}>
            {job.responsibilities.map((r,i) => <li key={i} style={{ fontSize:14, color:C.gray600, lineHeight:1.8 }}>{r}</li>)}
          </ul>
        </div>

        {/* 요구 사항 */}
        <div>
          <h4 style={{ margin:"0 0 10px", fontSize:15, fontWeight:700, color:C.gray800 }}>지원 요건</h4>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:12 }}>
            {job.requirements.skills.map(s => <Tag key={s} color={skillMatched.includes(s)?"green":"gray"}>{skillMatched.includes(s)?"✓ ":""}{s}</Tag>)}
          </div>
          <div style={{ fontSize:13, color:C.gray500 }}>학력: {job.requirements.education}</div>
          {job.requirements.preferred?.length > 0 && <div style={{ fontSize:13, color:C.gray500, marginTop:4 }}>우대: {job.requirements.preferred.join(" / ")}</div>}
        </div>

        {/* 버튼 */}
        <div style={{ display:"flex", gap:12, paddingTop:8, borderTop:`1px solid ${C.border}` }}>
          <Btn variant={isSaved?"secondary":"ghost"} onClick={onSave} style={{ flex:1 }}>{isSaved?"★ 저장됨":"☆ 저장하기"}</Btn>
          <Btn style={{ flex:2 }} onClick={() => setShowApply(true)}>지원하기 →</Btn>
        </div>
      </div>
    </Modal>
    </>
  );
}

// ─── 대시보드 ─────────────────────────────────────────────────────────────────
function DashboardPage({ profile, jobs, savedJobs, onSaveJob, onSelectJob }) {
  const topJobs = jobs.slice(0, 6);
  const newToday = jobs.filter(j => j.postedDate === "2026-04-10").length;
  const urgentJobs = savedJobs.filter(j => daysUntil(j.deadline) <= 7 && daysUntil(j.deadline) >= 0);
  const avgScore = jobs.length ? Math.round(jobs.reduce((s,j) => s+j.matchScore,0)/jobs.length) : 0;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
      {/* 환영 메시지 */}
      <div style={{ background:"linear-gradient(135deg, #1D4ED8, #0EA5E9)", borderRadius:16, padding:"28px 32px", color:C.white }}>
        <h2 style={{ margin:"0 0 6px", fontSize:24, fontWeight:800 }}>
          안녕하세요, {profile?.name || "회원"}님! 👋
        </h2>
        <p style={{ margin:0, opacity:0.9, fontSize:15 }}>
          오늘 {jobs.length}개의 맞춤 채용공고가 준비되어 있습니다. 평균 매칭률 {avgScore}%
        </p>
      </div>

      {/* 통계 카드 */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:16 }}>
        {[
          { label:"추천 공고", value:jobs.length, icon:"🎯", color:C.primary, bg:C.primaryLight },
          { label:"오늘 신규", value:newToday, icon:"✨", color:C.success, bg:C.successLight },
          { label:"저장한 공고", value:savedJobs.length, icon:"📌", color:C.warning, bg:C.warningLight },
          { label:"마감 임박", value:urgentJobs.length, icon:"⏰", color:C.danger, bg:C.dangerLight },
        ].map(s => (
          <Card key={s.label} style={{ textAlign:"center", padding:"18px 12px" }}>
            <div style={{ fontSize:28, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:28, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:13, color:C.gray500, marginTop:4 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* 마감 임박 알림 */}
      {urgentJobs.length > 0 && (
        <div style={{ background:C.dangerLight, border:`1px solid ${C.danger}`, borderRadius:12, padding:"16px 20px" }}>
          <div style={{ fontWeight:700, color:C.danger, marginBottom:8 }}>⏰ 마감 임박 공고</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {urgentJobs.map(j => (
              <div key={j.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:14, color:C.gray700 }}>{j.company} — {j.title}</span>
                <DeadlineBadge deadline={j.deadline} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 경력 재해석 카드 */}
      {profile?.skills?.length > 0 && (
        <div style={{ background:"linear-gradient(135deg,#F0FDF4,#ECFDF5)", border:`1px solid ${C.success}`, borderRadius:16, padding:"20px 24px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <span style={{ fontSize:22 }}>🔄</span>
            <div>
              <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:C.success }}>AI 경력 재해석</h3>
              <p style={{ margin:0, fontSize:13, color:C.gray500 }}>{profile.currentJob || "내 경력"} 기반으로 전환 가능한 커리어</p>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
            {getCareerPivots(profile.skills).map((p, i) => (
              <div key={i} style={{ background:C.white, borderRadius:10, padding:"12px 14px", border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:20, fontWeight:800, color:C.success, marginBottom:4 }}>{p.match}%</div>
                <div style={{ fontSize:14, fontWeight:700, color:C.gray800 }}>{p.role}</div>
                <div style={{ fontSize:12, color:C.gray500, marginTop:4 }}>{p.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 상위 추천 공고 */}
      <div>
        <h3 style={{ margin:"0 0 16px", fontSize:18, fontWeight:700, color:C.gray800 }}>🏆 AI 상위 추천 공고</h3>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))", gap:16 }}>
          {topJobs.map(job => (
            <JobCard key={job.id} job={job} isSaved={savedJobs.some(s=>s.id===job.id)} onSave={onSaveJob} onSelect={onSelectJob} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 채용공고 페이지 ──────────────────────────────────────────────────────────
function JobsPage({ jobs, savedJobs, onSaveJob, onSelectJob }) {
  const [keyword, setKeyword] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("전체");
  const [filterLocation, setFilterLocation] = useState("전체");
  const [filterJobType, setFilterJobType] = useState("전체");
  const [filterScore, setFilterScore] = useState(0);
  const [sortBy, setSortBy] = useState("score");

  const filtered = useMemo(() => {
    let list = jobs.filter(j => {
      if (keyword && !j.title.includes(keyword) && !j.company.includes(keyword) && !j.requirements.skills.some(s=>s.includes(keyword))) return false;
      if (filterIndustry !== "전체" && j.industry !== filterIndustry) return false;
      if (filterLocation !== "전체" && !j.location.includes(filterLocation)) return false;
      if (filterJobType !== "전체" && j.jobType !== filterJobType) return false;
      if (j.matchScore < filterScore) return false;
      return true;
    });
    if (sortBy === "score") list = [...list].sort((a,b) => b.matchScore - a.matchScore);
    else if (sortBy === "deadline") list = [...list].sort((a,b) => new Date(a.deadline) - new Date(b.deadline));
    else if (sortBy === "salary") list = [...list].sort((a,b) => b.salaryMax - a.salaryMax);
    return list;
  }, [jobs, keyword, filterIndustry, filterLocation, filterJobType, filterScore, sortBy]);

  const industries = ["전체", ...new Set(jobs.map(j=>j.industry))];
  const locs = ["전체", ...LOCATIONS.slice(0,8)];

  return (
    <div style={{ display:"flex", gap:24 }}>
      {/* 필터 사이드바 */}
      <div style={{ width:220, flexShrink:0 }}>
        <Card style={{ display:"flex", flexDirection:"column", gap:20, position:"sticky", top:0 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:C.gray800 }}>필터</h3>
          <Input placeholder="키워드 검색" value={keyword} onChange={setKeyword} />
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:C.gray600, display:"block", marginBottom:8 }}>업종</label>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {industries.map(i => (
                <button key={i} onClick={()=>setFilterIndustry(i)} style={{ padding:"6px 10px", textAlign:"left", border:`1px solid ${filterIndustry===i?C.primary:C.border}`, borderRadius:6, background:filterIndustry===i?C.primaryLight:C.white, color:filterIndustry===i?C.primary:C.gray600, fontSize:13, cursor:"pointer" }}>{i}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:C.gray600, display:"block", marginBottom:8 }}>지역</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {locs.map(l => (
                <button key={l} onClick={()=>setFilterLocation(l)} style={{ padding:"4px 8px", border:`1px solid ${filterLocation===l?C.primary:C.border}`, borderRadius:6, background:filterLocation===l?C.primaryLight:C.white, color:filterLocation===l?C.primary:C.gray600, fontSize:12, cursor:"pointer" }}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:C.gray600 }}>최소 매칭 점수: {filterScore}점 이상</label>
            <input type="range" min={0} max={80} step={10} value={filterScore} onChange={e=>setFilterScore(+e.target.value)} style={{ width:"100%", marginTop:6, accentColor:C.primary }} />
          </div>
          <Btn variant="ghost" size="sm" onClick={()=>{ setKeyword(""); setFilterIndustry("전체"); setFilterLocation("전체"); setFilterJobType("전체"); setFilterScore(0); }}>필터 초기화</Btn>
        </Card>
      </div>

      {/* 공고 목록 */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <span style={{ fontSize:15, color:C.gray500 }}><strong style={{ color:C.gray800 }}>{filtered.length}개</strong> 공고 검색됨</span>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ padding:"8px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, background:C.white, color:C.gray700 }}>
            <option value="score">매칭 점수 순</option>
            <option value="deadline">마감일 순</option>
            <option value="salary">연봉 높은 순</option>
          </select>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {filtered.map(job => (
            <JobCard key={job.id} job={job} isSaved={savedJobs.some(s=>s.id===job.id)} onSave={onSaveJob} onSelect={onSelectJob} />
          ))}
          {!filtered.length && (
            <div style={{ textAlign:"center", padding:60, color:C.gray400 }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🔍</div>
              <div style={{ fontSize:16 }}>조건에 맞는 공고가 없습니다</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 프로필 페이지 ────────────────────────────────────────────────────────────
function ProfilePage({ profile, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(profile || {});
  const up = (k,v) => setForm(f=>({...f,[k]:v}));
  const toggleSkill = s => up("skills", (form.skills||[]).includes(s) ? form.skills.filter(x=>x!==s) : [...(form.skills||[]), s]);
  const toggleInd = i => up("industries", (form.industries||[]).includes(i) ? form.industries.filter(x=>x!==i) : [...(form.industries||[]), i]);

  const handleSave = () => { onUpdate(form); setEditing(false); };

  if (!profile) return <div style={{ textAlign:"center", padding:60, color:C.gray400 }}>프로필이 없습니다.</div>;

  return (
    <div style={{ maxWidth:720, display:"flex", flexDirection:"column", gap:20 }}>
      {/* 프로필 헤더 */}
      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ display:"flex", gap:16, alignItems:"center" }}>
            <div style={{ width:64, height:64, borderRadius:"50%", background:"linear-gradient(135deg, #1D4ED8, #0EA5E9)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, color:C.white, fontWeight:700 }}>
              {(profile.name||"?")[0]}
            </div>
            <div>
              <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:C.gray800 }}>{profile.name}</h2>
              <p style={{ margin:"4px 0 0", fontSize:14, color:C.gray500 }}>{profile.currentJob} | {profile.currentCompany}</p>
              <p style={{ margin:"2px 0 0", fontSize:13, color:C.gray400 }}>📍 {profile.location} · 총 경력 {profile.totalExperience}년 · {profile.ageRange}</p>
            </div>
          </div>
          <Btn variant={editing?"primary":"ghost"} size="sm" onClick={() => editing ? handleSave() : setEditing(true)}>
            {editing ? "저장" : "✏️ 편집"}
          </Btn>
        </div>
      </Card>

      {/* 경력 정보 */}
      <Card>
        <h3 style={{ margin:"0 0 16px", fontSize:16, fontWeight:700, color:C.gray800 }}>경력 정보</h3>
        {editing ? (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Input label="이름" value={form.name||""} onChange={v=>up("name",v)} />
            <Input label="최근 직무" value={form.currentJob||""} onChange={v=>up("currentJob",v)} />
            <Input label="최근 회사" value={form.currentCompany||""} onChange={v=>up("currentCompany",v)} />
            <Select label="주요 업종" value={form.currentIndustry||ALL_INDUSTRIES[0]} onChange={v=>up("currentIndustry",v)} options={ALL_INDUSTRIES.map(v=>({value:v,label:v}))} />
            <div>
              <label style={{ fontSize:14, fontWeight:600, color:C.gray700 }}>총 경력: <span style={{ color:C.primary }}>{form.totalExperience}년</span></label>
              <input type="range" min={1} max={40} value={form.totalExperience||10} onChange={e=>up("totalExperience",+e.target.value)} style={{ width:"100%", marginTop:6, accentColor:C.primary }} />
            </div>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            {[["직무",profile.currentJob],["회사",profile.currentCompany],["업종",profile.currentIndustry],["총 경력",`${profile.totalExperience}년`],["연령대",profile.ageRange],["거주지",profile.location]].map(([k,v]) => (
              <div key={k} style={{ background:C.gray50, borderRadius:8, padding:"10px 14px" }}>
                <div style={{ fontSize:12, color:C.gray400, marginBottom:2 }}>{k}</div>
                <div style={{ fontSize:14, fontWeight:600, color:C.gray700 }}>{v||"-"}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 보유 스킬 */}
      <Card>
        <h3 style={{ margin:"0 0 12px", fontSize:16, fontWeight:700, color:C.gray800 }}>보유 스킬</h3>
        {editing ? (
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {ALL_SKILLS.map(s => (
              <button key={s} onClick={()=>toggleSkill(s)} style={{ padding:"6px 12px", borderRadius:20, border:`1.5px solid ${(form.skills||[]).includes(s)?C.primary:C.border}`, background:(form.skills||[]).includes(s)?C.primaryLight:C.white, color:(form.skills||[]).includes(s)?C.primary:C.gray500, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                {(form.skills||[]).includes(s)?"✓ ":""}{s}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {(profile.skills||[]).map(s => <Tag key={s} color="blue">{s}</Tag>)}
            {!profile.skills?.length && <span style={{ color:C.gray400, fontSize:14 }}>스킬을 추가해 주세요</span>}
          </div>
        )}
      </Card>

      {/* 경험 업종 */}
      <Card>
        <h3 style={{ margin:"0 0 12px", fontSize:16, fontWeight:700, color:C.gray800 }}>경험 업종</h3>
        {editing ? (
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {ALL_INDUSTRIES.map(i => (
              <button key={i} onClick={()=>toggleInd(i)} style={{ padding:"6px 12px", borderRadius:20, border:`1.5px solid ${(form.industries||[]).includes(i)?C.success:C.border}`, background:(form.industries||[]).includes(i)?C.successLight:C.white, color:(form.industries||[]).includes(i)?C.success:C.gray500, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                {i}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {(profile.industries||[]).map(i => <Tag key={i} color="green">{i}</Tag>)}
          </div>
        )}
      </Card>

      {/* 희망 조건 */}
      <Card>
        <h3 style={{ margin:"0 0 16px", fontSize:16, fontWeight:700, color:C.gray800 }}>희망 근무 조건</h3>
        {editing ? (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <Input label="희망 직무" value={form.desiredJob||""} onChange={v=>up("desiredJob",v)} />
            <div>
              <label style={{ fontSize:14, fontWeight:600, color:C.gray700 }}>희망 연봉 (최소): <span style={{ color:C.primary }}>{(form.desiredSalaryMin||5000).toLocaleString()}만원</span></label>
              <input type="range" min={3000} max={15000} step={500} value={form.desiredSalaryMin||5000} onChange={e=>up("desiredSalaryMin",+e.target.value)} style={{ width:"100%", marginTop:6, accentColor:C.primary }} />
            </div>
            <Select label="희망 지역" value={form.desiredLocation||"서울"} onChange={v=>up("desiredLocation",v)} options={["무관",...LOCATIONS].map(v=>({value:v,label:v}))} />
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            {[["희망 직무",profile.desiredJob||"-"],["희망 연봉",`${(profile.desiredSalaryMin||0).toLocaleString()}만원 이상`],["희망 지역",profile.desiredLocation||"-"]].map(([k,v]) => (
              <div key={k} style={{ background:C.gray50, borderRadius:8, padding:"10px 14px" }}>
                <div style={{ fontSize:12, color:C.gray400, marginBottom:2 }}>{k}</div>
                <div style={{ fontSize:14, fontWeight:600, color:C.gray700 }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ─── 이력서 업로드 ─── */}
      <Card>
        <h3 style={{ margin:"0 0 12px", fontSize:16, fontWeight:700, color:C.gray800 }}>이력서 업로드</h3>
        <ResumeUploadSection />
      </Card>

      {/* ─── 경력 재해석 ─── */}
      <Card style={{ border:`2px solid ${C.primary}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
          <span style={{ fontSize:22 }}>🔄</span>
          <div>
            <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:C.primary }}>AI 경력 재해석</h3>
            <p style={{ margin:0, fontSize:13, color:C.gray500 }}>내 경험을 살려 도전할 수 있는 새로운 커리어 방향</p>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {getCareerPivots(profile.skills).map((pivot, i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", background:C.gray50, borderRadius:10, border:`1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:C.gray800 }}>{pivot.role}</div>
                <div style={{ fontSize:13, color:C.gray500, marginTop:3 }}>💡 {pivot.reason}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:18, fontWeight:800, color:pivot.match>=85?C.success:C.primary }}>{pivot.match}%</div>
                  <div style={{ fontSize:11, color:C.gray400 }}>전환 적합도</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p style={{ margin:"14px 0 0", fontSize:12, color:C.gray400, textAlign:"center" }}>
          * 보유 스킬과 경력을 기반으로 AI가 분석한 커리어 전환 추천입니다
        </p>
      </Card>
    </div>
  );
}

// ─── 이력서 업로드 섹션 ──────────────────────────────────────────────────────
function ResumeUploadSection() {
  const [file, setFile] = useState(() => LS.get("resume", null));
  const [dragging, setDragging] = useState(false);

  const handleFile = f => {
    if (!f) return;
    if (f.type !== "application/pdf") { alert("PDF 파일만 업로드 가능합니다."); return; }
    const info = { name: f.name, size: (f.size / 1024).toFixed(1) + " KB", uploadedAt: new Date().toLocaleString("ko-KR") };
    setFile(info);
    LS.set("resume", info);
  };

  return (
    <div>
      {file ? (
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", background:C.successLight, borderRadius:10, border:`1px solid ${C.success}` }}>
          <span style={{ fontSize:28 }}>📄</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700, color:C.gray800 }}>{file.name}</div>
            <div style={{ fontSize:12, color:C.gray500 }}>{file.size} · {file.uploadedAt} 업로드</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Tag color="green">✓ 등록됨</Tag>
            <button onClick={() => { setFile(null); LS.set("resume", null); }} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 10px", fontSize:12, color:C.gray500, cursor:"pointer" }}>삭제</button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          style={{ border:`2px dashed ${dragging?C.primary:C.border}`, borderRadius:12, padding:"32px 20px", textAlign:"center", background:dragging?C.primaryLight:C.gray50, transition:"all 0.15s", cursor:"pointer" }}
          onClick={() => document.getElementById("resume-input").click()}
        >
          <div style={{ fontSize:36, marginBottom:8 }}>📤</div>
          <div style={{ fontSize:15, fontWeight:600, color:C.gray700 }}>이력서를 드래그하거나 클릭해서 업로드</div>
          <div style={{ fontSize:13, color:C.gray400, marginTop:4 }}>PDF 형식 · 최대 10MB</div>
          <input id="resume-input" type="file" accept=".pdf" style={{ display:"none" }} onChange={e => handleFile(e.target.files[0])} />
        </div>
      )}
    </div>
  );
}

// ─── 캘린더 페이지 ────────────────────────────────────────────────────────────
function CalendarPage({ savedJobs, onSelectJob }) {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 3, 1)); // April 2026
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const weekDays = ["일","월","화","수","목","금","토"];

  const deadlineMap = {};
  savedJobs.forEach(j => {
    const d = new Date(j.deadline);
    if (d.getFullYear()===year && d.getMonth()===month) {
      const key = d.getDate();
      if (!deadlineMap[key]) deadlineMap[key] = [];
      deadlineMap[key].push(j);
    }
  });

  const upcoming = savedJobs
    .map(j => ({ ...j, daysLeft: daysUntil(j.deadline) }))
    .filter(j => j.daysLeft >= 0)
    .sort((a,b) => a.daysLeft - b.daysLeft)
    .slice(0, 10);

  return (
    <div style={{ display:"flex", gap:24 }}>
      {/* 캘린더 */}
      <div style={{ flex:1 }}>
        <Card>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <button onClick={()=>setCurrentDate(new Date(year, month-1, 1))} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:C.gray600, padding:"4px 8px" }}>‹</button>
            <h3 style={{ margin:0, fontSize:18, fontWeight:700, color:C.gray800 }}>{year}년 {month+1}월</h3>
            <button onClick={()=>setCurrentDate(new Date(year, month+1, 1))} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:C.gray600, padding:"4px 8px" }}>›</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:2 }}>
            {weekDays.map(d => <div key={d} style={{ textAlign:"center", fontSize:13, fontWeight:700, color:C.gray400, padding:"8px 0" }}>{d}</div>)}
            {Array(firstDay).fill(null).map((_,i) => <div key={`e${i}`} />)}
            {Array(daysInMonth).fill(null).map((_,i) => {
              const day = i+1;
              const hasDeadline = deadlineMap[day];
              const today = new Date();
              const isToday = today.getFullYear()===year && today.getMonth()===month && today.getDate()===day;
              return (
                <div key={day} style={{ textAlign:"center", padding:"8px 4px", borderRadius:8, background:isToday?C.primary:hasDeadline?"transparent":C.white, cursor:hasDeadline?"pointer":"default", minHeight:56, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}
                  onClick={()=>hasDeadline && onSelectJob(hasDeadline[0])}>
                  <span style={{ fontSize:14, fontWeight:isToday?700:400, color:isToday?C.white:C.gray700 }}>{day}</span>
                  {hasDeadline && hasDeadline.map((j,idx) => {
                    const dl = daysUntil(j.deadline);
                    const dotColor = dl<=1?C.danger:dl<=3?C.warning:C.primary;
                    return <div key={idx} style={{ width:"85%", borderRadius:3, background:dotColor, color:C.white, fontSize:10, fontWeight:600, padding:"1px 3px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.title.slice(0,6)}</div>;
                  })}
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex", gap:16, marginTop:16, padding:"12px 0", borderTop:`1px solid ${C.border}` }}>
            {[["오늘",C.primary],["D-3 이내",C.danger],["D-7 이내",C.warning],["저장 공고",C.primary]].map(([l,c]) => (
              <div key={l} style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:C.gray500 }}>
                <div style={{ width:10, height:10, borderRadius:2, background:c }} />{l}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 마감 임박 목록 */}
      <div style={{ width:280, flexShrink:0 }}>
        <Card>
          <h3 style={{ margin:"0 0 16px", fontSize:16, fontWeight:700, color:C.gray800 }}>📅 마감 일정</h3>
          {upcoming.length === 0 ? (
            <div style={{ textAlign:"center", padding:"30px 0", color:C.gray400 }}>
              <div style={{ fontSize:36 }}>📭</div>
              <div style={{ marginTop:8, fontSize:14 }}>저장한 공고가 없습니다</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {upcoming.map(j => (
                <div key={j.id} onClick={() => onSelectJob(j)} style={{ padding:"12px 14px", borderRadius:10, border:`1px solid ${j.daysLeft<=3?C.danger:C.border}`, background:j.daysLeft<=3?C.dangerLight:C.gray50, cursor:"pointer" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.gray800, marginBottom:4 }}>{j.title}</div>
                  <div style={{ fontSize:12, color:C.gray500, marginBottom:6 }}>{j.company}</div>
                  <DeadlineBadge deadline={j.deadline} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── 저장 공고 페이지 ─────────────────────────────────────────────────────────
function SavedJobsPage({ savedJobs, onSelectJob, onRemove, onUpdateStatus }) {
  const statuses = ["전체","저장됨","지원함","결과대기","합격","불합격"];
  const [filter, setFilter] = useState("전체");
  const statusColors = { "저장됨":"gray", "지원함":"blue", "결과대기":"amber", "합격":"green", "불합격":"red" };
  const list = filter === "전체" ? savedJobs : savedJobs.filter(j=>j.status===filter);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:C.gray800 }}>저장한 공고 ({savedJobs.length})</h2>
        <div style={{ display:"flex", gap:8 }}>
          {statuses.map(s => (
            <button key={s} onClick={()=>setFilter(s)} style={{ padding:"6px 14px", borderRadius:20, border:`1.5px solid ${filter===s?C.primary:C.border}`, background:filter===s?C.primaryLight:C.white, color:filter===s?C.primary:C.gray500, fontSize:13, fontWeight:600, cursor:"pointer" }}>{s}</button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div style={{ textAlign:"center", padding:"80px 0", color:C.gray400 }}>
          <div style={{ fontSize:56 }}>📂</div>
          <div style={{ fontSize:18, fontWeight:600, marginTop:16 }}>저장한 공고가 없습니다</div>
          <div style={{ fontSize:14, marginTop:8 }}>채용공고에서 관심 있는 공고를 저장해 보세요</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {list.map(job => (
            <Card key={job.id} style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
              <ScoreBadge score={job.matchScore} />
              <div style={{ flex:1, minWidth:0, cursor:"pointer" }} onClick={() => onSelectJob(job)}>
                <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:4 }}>
                  <span style={{ fontSize:16, fontWeight:700, color:C.gray800 }}>{job.title}</span>
                  <Tag color={statusColors[job.status]||"gray"}>{job.status}</Tag>
                </div>
                <div style={{ fontSize:14, color:C.gray500 }}>{job.company} · {job.location} · {job.salary}</div>
                <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap" }}>
                  {job.requirements.skills.slice(0,3).map(s=><Tag key={s}>{s}</Tag>)}
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end", flexShrink:0 }}>
                <DeadlineBadge deadline={job.deadline} />
                <select value={job.status} onChange={e=>onUpdateStatus(job.id, e.target.value)}
                  onClick={e=>e.stopPropagation()}
                  style={{ padding:"4px 8px", border:`1px solid ${C.border}`, borderRadius:6, fontSize:12, background:C.white, cursor:"pointer" }}>
                  {statuses.slice(1).map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={()=>onRemove(job.id)} style={{ padding:"4px 10px", background:"none", border:`1px solid ${C.border}`, borderRadius:6, fontSize:12, color:C.gray400, cursor:"pointer" }}>삭제</button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 사이드바 ─────────────────────────────────────────────────────────────────
const NAV = [
  { key:"dashboard", icon:"🏠", label:"대시보드" },
  { key:"jobs",      icon:"💼", label:"채용공고" },
  { key:"saved",     icon:"📌", label:"저장 공고" },
  { key:"calendar",  icon:"📅", label:"캘린더" },
  { key:"profile",   icon:"👤", label:"내 프로필" },
];

function Sidebar({ activePage, setActivePage, user, profile, onLogout, savedCount }) {
  return (
    <div style={{ width:230, background:C.white, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", flexShrink:0, overflow:"auto" }}>
      {/* 로고 */}
      <div style={{ padding:"20px 20px 16px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:24 }}>🎯</span>
          <div>
            <div style={{ fontWeight:800, fontSize:14, color:C.primary, lineHeight:1.2 }}>MidCareer</div>
            <div style={{ fontWeight:800, fontSize:14, color:C.gray800, lineHeight:1.2 }}>Match AI</div>
          </div>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav style={{ flex:1, padding:"12px 10px", display:"flex", flexDirection:"column", gap:2 }}>
        {NAV.map(n => (
          <button key={n.key} onClick={()=>setActivePage(n.key)}
            style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px", borderRadius:10, border:"none", background:activePage===n.key?C.primaryLight:"transparent", color:activePage===n.key?C.primary:C.gray600, fontWeight:activePage===n.key?700:500, fontSize:14, cursor:"pointer", textAlign:"left", transition:"all 0.15s", position:"relative" }}>
            <span style={{ fontSize:18 }}>{n.icon}</span>
            {n.label}
            {n.key==="saved" && savedCount>0 && <span style={{ marginLeft:"auto", background:C.primary, color:C.white, borderRadius:10, fontSize:11, fontWeight:700, padding:"2px 7px" }}>{savedCount}</span>}
          </button>
        ))}
      </nav>

      {/* 사용자 정보 */}
      <div style={{ padding:"16px 20px", borderTop:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:"linear-gradient(135deg,#1D4ED8,#0EA5E9)", display:"flex", alignItems:"center", justifyContent:"center", color:C.white, fontWeight:700, fontSize:14 }}>
            {(profile?.name||user?.name||"U")[0]}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:700, color:C.gray800, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{profile?.name||user?.name||"사용자"}</div>
            <div style={{ fontSize:12, color:C.gray400 }}>{profile?.currentJob||"프로필 미완성"}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ width:"100%", padding:"8px", background:"none", border:`1px solid ${C.border}`, borderRadius:8, fontSize:13, color:C.gray500, cursor:"pointer" }}>로그아웃</button>
      </div>
    </div>
  );
}

// ─── 헤더 ─────────────────────────────────────────────────────────────────────
const PAGE_TITLES = { dashboard:"대시보드", jobs:"채용공고 전체보기", saved:"저장한 공고", calendar:"채용 캘린더", profile:"내 프로필" };

function Header({ activePage, notifications, onClearNotif }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const unread = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div style={{ height:60, background:C.white, borderBottom:`1px solid ${C.border}`, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
      <h1 style={{ margin:0, fontSize:18, fontWeight:700, color:C.gray800 }}>{PAGE_TITLES[activePage]}</h1>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        {/* 알림 벨 */}
        <div ref={ref} style={{ position:"relative" }}>
          <button onClick={() => setOpen(o => !o)} style={{ position:"relative", background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:36, height:36, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>
            🔔
            {unread > 0 && (
              <span style={{ position:"absolute", top:-4, right:-4, background:C.danger, color:C.white, borderRadius:"50%", width:16, height:16, fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>{unread}</span>
            )}
          </button>
          {open && (
            <div style={{ position:"absolute", top:44, right:0, width:320, background:C.white, borderRadius:12, border:`1px solid ${C.border}`, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", zIndex:500, overflow:"hidden" }}>
              <div style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontWeight:700, fontSize:14, color:C.gray800 }}>알림</span>
                {notifications.length > 0 && <button onClick={onClearNotif} style={{ background:"none", border:"none", fontSize:12, color:C.gray400, cursor:"pointer" }}>모두 지우기</button>}
              </div>
              <div style={{ maxHeight:300, overflow:"auto" }}>
                {notifications.length === 0 ? (
                  <div style={{ padding:"24px 16px", textAlign:"center", color:C.gray400, fontSize:14 }}>새 알림이 없습니다</div>
                ) : notifications.map(n => (
                  <div key={n.id} style={{ padding:"12px 16px", borderBottom:`1px solid ${C.border}`, background:n.read?"transparent":C.primaryLight }}>
                    <div style={{ fontSize:13, color:C.gray700, lineHeight:1.5 }}>{n.message}</div>
                    <div style={{ fontSize:11, color:C.gray400, marginTop:4 }}>{n.time}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ background:C.successLight, color:C.success, padding:"4px 12px", borderRadius:20, fontSize:12, fontWeight:700 }}>
          🟢 데모 모드
        </div>
      </div>
    </div>
  );
}

// ─── 메인 앱 ──────────────────────────────────────────────────────────────────
export default function MidCareerApp() {
  const [view, setView] = useState(() => {
    const u = LS.get("user", null);
    const p = LS.get("profile", null);
    if (!u) return "login";
    if (!p) return "onboarding";
    return "app";
  });
  const [activePage, setActivePage] = useState("dashboard");
  const [user, setUser]       = useState(() => LS.get("user", null));
  const [profile, setProfile] = useState(() => LS.get("profile", null));
  const [savedJobs, setSavedJobs] = useState(() => LS.get("savedJobs", []));
  const [selectedJob, setSelectedJob] = useState(null);
  const [toasts, setToasts]   = useState([]);
  const [notifications, setNotifications] = useState(() => LS.get("notifications", []));
  const toastId = useRef(0);

  // ── 토스트 헬퍼 ──
  const addToast = useCallback((message, type = "success") => {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const removeToast = useCallback(id => setToasts(prev => prev.filter(t => t.id !== id)), []);

  // ── 알림 헬퍼 ──
  const addNotif = useCallback((message) => {
    const n = { id: Date.now(), message, time: new Date().toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit" }), read: false };
    setNotifications(prev => {
      const next = [n, ...prev].slice(0, 20);
      LS.set("notifications", next);
      return next;
    });
  }, []);

  // AI 매칭 적용
  const jobs = useMemo(() =>
    MOCK_JOBS.map(j => ({
      ...j,
      matchScore: calcMatchScore(profile, j),
      matchReasons: calcMatchReasons(profile, j),
    })).sort((a,b) => b.matchScore - a.matchScore),
  [profile]);

  const handleDemoLogin = () => {
    const u = { id:"demo", name:"데모 사용자", email:"demo@jobmatch.ai" };
    setUser(u); LS.set("user", u);
    setView("onboarding");
  };

  const handleProfileComplete = (p) => {
    setProfile(p); LS.set("profile", p);
    setView("app");
    addToast(`${p.name}님, AI 매칭을 시작합니다! 🎯`);
  };

  const handleSaveJob = useCallback((job) => {
    setSavedJobs(prev => {
      const exists = prev.some(j => j.id === job.id);
      const next = exists
        ? prev.filter(j => j.id !== job.id)
        : [...prev, { ...job, savedAt: new Date().toISOString(), status: "저장됨" }];
      LS.set("savedJobs", next);
      if (!exists) {
        addToast(`"${job.title}" 저장됨 📌`);
        addNotif(`[${job.company}] ${job.title} 공고를 저장했습니다.`);
      } else {
        addToast(`저장 취소됨`, "info");
      }
      return next;
    });
  }, [addToast, addNotif]);

  const handleApplyJob = useCallback((job) => {
    // 저장됨 → 지원함 상태 변경
    setSavedJobs(prev => {
      const exists = prev.some(j => j.id === job.id);
      const base = exists ? prev : [...prev, { ...job, savedAt: new Date().toISOString(), status: "저장됨" }];
      const next = base.map(j => j.id === job.id ? { ...j, status:"지원함", appliedAt: new Date().toISOString() } : j);
      LS.set("savedJobs", next);
      return next;
    });
    addToast(`"${job.title}" 지원 완료! ✅`, "success");
    addNotif(`[${job.company}] ${job.title}에 지원했습니다.`);
    setSelectedJob(null);
  }, [addToast, addNotif]);

  const handleLogout = () => {
    LS.clear();
    setUser(null); setProfile(null); setSavedJobs([]); setNotifications([]);
    setView("login");
  };

  if (view === "login") return <LoginPage onDemoLogin={handleDemoLogin} />;
  if (view === "onboarding") return <OnboardingPage user={user} onComplete={handleProfileComplete} />;

  return (
    <div style={{ display:"flex", height:"100vh", background:C.bg }}>
      <Sidebar activePage={activePage} setActivePage={setActivePage} user={user} profile={profile} onLogout={handleLogout} savedCount={savedJobs.length} />
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, overflow:"hidden" }}>
        <Header
          activePage={activePage}
          notifications={notifications}
          onClearNotif={() => { setNotifications([]); LS.set("notifications",[]); }}
        />
        <main style={{ flex:1, overflow:"auto", padding:24 }}>
          {activePage === "dashboard" && <DashboardPage profile={profile} jobs={jobs} savedJobs={savedJobs} onSaveJob={handleSaveJob} onSelectJob={setSelectedJob} />}
          {activePage === "jobs"      && <JobsPage jobs={jobs} savedJobs={savedJobs} onSaveJob={handleSaveJob} onSelectJob={setSelectedJob} />}
          {activePage === "profile"   && <ProfilePage profile={profile} onUpdate={p => { setProfile(p); LS.set("profile",p); addToast("프로필이 저장되었습니다 ✅"); }} />}
          {activePage === "calendar"  && <CalendarPage savedJobs={savedJobs} onSelectJob={setSelectedJob} />}
          {activePage === "saved"     && (
            <SavedJobsPage
              savedJobs={savedJobs}
              onSelectJob={setSelectedJob}
              onRemove={id => { const n=savedJobs.filter(j=>j.id!==id); setSavedJobs(n); LS.set("savedJobs",n); addToast("공고가 삭제되었습니다","info"); }}
              onUpdateStatus={(id,s) => { const n=savedJobs.map(j=>j.id===id?{...j,status:s}:j); setSavedJobs(n); LS.set("savedJobs",n); addToast(`상태가 "${s}"로 변경되었습니다`); }}
            />
          )}
        </main>
      </div>
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          profile={profile}
          isSaved={savedJobs.some(j => j.id === selectedJob.id)}
          onSave={() => handleSaveJob(selectedJob)}
          onApply={handleApplyJob}
          onClose={() => setSelectedJob(null)}
        />
      )}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
