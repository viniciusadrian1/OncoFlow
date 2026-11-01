// Seleção de perfis fictícios. Esta tela não representa autenticação institucional.
import React from 'react';
import { ArrowRight, Info, Stethoscope, HeartPulse, Route, Smartphone, Check } from 'lucide-react';
import type { UsuarioEquipe } from '../types';
import { LogoOncoFlow } from './LogoOncoFlow';
import { ROTULO_PAPEL } from './Pendencias';

interface LoginViewProps { usuarios: UsuarioEquipe[]; onLogin: (usuario: UsuarioEquipe) => void; }
const ICONE_PAPEL = { medico: Stethoscope, enfermagem: HeartPulse, navegacao: Route };

export const LoginView: React.FC<LoginViewProps> = ({ usuarios, onLogin }) => (
  <main className="login-page">
    <section className="login-story" aria-labelledby="titulo-oncoflow">
      <div className="login-brand"><LogoOncoFlow className="login-brand-logo" /><span className="pro-brand-badge">Pro</span></div>
      <div className="login-story-content">
        <h1 id="titulo-oncoflow">Every step of care, connected.</h1>
        <p>A space for the care team to follow the journey, organize next steps and stay closer to the patient.</p>
        <div className="login-journey" aria-label="Appointment, navigation and patient connected">
          <div className="login-journey-line" aria-hidden />
          <div className="login-journey-step"><span><Stethoscope size={22} aria-hidden /></span><div><strong>In the appointment</strong><small>Listen and understand</small></div><Check size={17} aria-hidden /></div>
          <div className="login-journey-step"><span><Route size={22} aria-hidden /></span><div><strong>With the team</strong><small>Organize and follow up</small></div><Check size={17} aria-hidden /></div>
          <div className="login-journey-step"><span><Smartphone size={22} aria-hidden /></span><div><strong>With the patient</strong><small>Make the next step clear</small></div><ArrowRight size={17} aria-hidden /></div>
        </div>
      </div>
      <p className="login-story-footer">Technology for more connected care.</p>
    </section>

    <section className="login-access" aria-labelledby="titulo-acesso">
      <div className="login-access-content">
        <span className="demo-pill"><span className="demo-dot" aria-hidden />Interactive demo</span>
        <h2 id="titulo-acesso">Welcome to<br />OncoFlow Pro.</h2>
        <p className="login-description">Choose a profile to explore the team workspace.</p>
        <div className="login-users">
          {usuarios.length === 0 ? <p role="status">Loading profiles…</p> : usuarios.map((u) => {
            const Icone = ICONE_PAPEL[u.papel];
            return <button key={u.id} type="button" id={`btn-entrar-${u.id}`} aria-label={`Sign in as ${u.nome}, ${ROTULO_PAPEL[u.papel]}`} onClick={() => onLogin(u)} className="login-user">
              <span className={`login-user-icon role-${u.papel}`}><Icone size={23} aria-hidden /></span>
              <span className="login-user-info"><small>{ROTULO_PAPEL[u.papel]}</small><strong>{u.nome}</strong><span>{u.cargo}</span></span>
              <ArrowRight size={19} className="login-user-arrow" aria-hidden />
            </button>;
          })}
        </div>
        <div className="login-disclosure"><Info size={18} aria-hidden /><p><strong>Demo with fictional data.</strong> No real authentication at this stage. Access by role, institution, team and purpose comes before any pilot.</p></div>
        <a href="/app/" className="login-patient-link"><Smartphone size={17} aria-hidden />See the patient app<ArrowRight size={16} aria-hidden /></a>
      </div>
    </section>
  </main>
);
