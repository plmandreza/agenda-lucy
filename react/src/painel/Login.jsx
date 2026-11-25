// LOGIN da Lucy (e-mail e senha, com o "olhinho" para ver a senha)
import { useEffect, useRef, useState } from 'react';
import { api, sessao } from '../api.js';

const Olho = ({ fechado }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {fechado ? (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
      </>
    ) : (
      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
    )}
  </svg>
);

export default function Login({ aviso, entrou }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [msg, setMsg] = useState(aviso);
  const [entrando, setEntrando] = useState(false);
  const refEmail = useRef(null);
  const refSenha = useRef(null);
  useEffect(() => { refEmail.current?.focus(); }, []);

  const enviar = async (ev) => {
    ev.preventDefault();
    if (!email.trim() || !senha) return setMsg('Preencha o e-mail e a senha.');
    setEntrando(true); setMsg('');
    try {
      sessao.salvar(await api('/api/login', { metodo: 'POST', corpo: { email: email.trim(), senha } }));
      entrou();
    } catch (e) { setMsg(e.message); setEntrando(false); }
  };
  // Olhinho aberto = toque para ver a senha; olhinho riscado = toque para esconder.
  const rotulo = verSenha ? 'Esconder senha' : 'Mostrar senha';
  return (
    <>
      <a className="voltar" href="#/">← Voltar ao site</a>
      <form className="cartao" id="form-login" noValidate onSubmit={enviar}>
        <h1>Área da Lucy</h1>
        <p className="suave">Entre com seu e-mail e senha.</p>
        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" autoComplete="username" inputMode="email" required ref={refEmail}
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="senha">Senha</label>
        <div className="linha-senha">
          <input id="senha" type={verSenha ? 'text' : 'password'} autoComplete="current-password" required ref={refSenha}
            value={senha} onChange={(e) => setSenha(e.target.value)} />
          <button type="button" className="olhinho" id="ver-senha" aria-label={rotulo} title={rotulo}
            onClick={() => { setVerSenha(!verSenha); refSenha.current?.focus(); }}><Olho fechado={verSenha} /></button>
        </div>
        <button type="submit" className="botao-largo" id="entrar" disabled={entrando}>{entrando ? 'Entrando…' : 'Entrar'}</button>
        <p className="mensagem erro" id="msg" role="alert">{msg}</p>
      </form>
    </>
  );
}
