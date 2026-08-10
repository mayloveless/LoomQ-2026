type LearnScreenProps = {
  onStart: () => void
}

const RECAP = [
  ['qubit', '程序正在操作的数据单位'],
  ['state', '程序此刻保留的量子可能性'],
  ['gate', '改变当前量子状态的操作'],
  ['circuit', '按顺序执行的一组量子操作'],
  ['measurement', '把量子状态读取为经典结果'],
]

export function LearnScreen({ onStart }: LearnScreenProps) {
  return (
    <main className="learn-shell">
      <header className="learn-topbar">
        <div className="brand-mark"><span>L</span></div>
        <div className="learn-brand">
          <div><strong>LoomQ</strong><span>Learn</span></div>
          <p>开发者的量子程序入门</p>
        </div>
        <button className="learn-skip" onClick={onStart}>直接进入 Explorer <span>→</span></button>
      </header>

      <section className="learn-hero">
        <div className="learn-hero-copy">
          <span className="learn-eyebrow">ONE QUBIT · THREE STEPS</span>
          <h1>跟着一个 qubit，<br />看懂量子程序怎么运行</h1>
          <p>不需要量子物理背景。我们只运行一个真实的三步程序：准备状态、用 H 改变状态，最后读取结果。</p>
          <a className="learn-primary learn-guide-link" href="#guided-program">从第一步开始 <span>↓</span></a>
        </div>
        <div className="learn-code-window" aria-label="单量子比特 OpenQASM 程序">
          <div className="learn-window-bar"><i /><i /><i /><span>one-qubit.qasm</span></div>
          <div className="learn-code-lines">
            <p><em>01</em><code><b>OPENQASM</b> 2.0;</code></p>
            <p><em>02</em><code><b>include</b> <span>&quot;qelib1.inc&quot;</span>;</code></p>
            <p className="active"><em>03</em><code>qreg q[<span>1</span>];</code></p>
            <p><em>04</em><code>creg c[<span>1</span>];</code></p>
            <p><em>05</em><code>h q[<span>0</span>];</code></p>
            <p><em>06</em><code>measure q[<span>0</span>] -&gt; c[<span>0</span>];</code></p>
          </div>
          <div className="learn-flow">
            <span>准备 |0⟩</span><i>→</i><span>H 改变状态</span><i>→</i><span>测量读取</span>
          </div>
        </div>
      </section>

      <section className="learn-program" id="guided-program" aria-labelledby="program-heading">
        <div className="learn-section-heading">
          <div>
            <span>GUIDED PROGRAM</span>
            <h2 id="program-heading">一个程序，三步看完</h2>
          </div>
          <p>先观察每条指令让状态发生了什么，再认识这些概念的名字。</p>
        </div>

        <div className="learn-step-list">
          <article className="learn-program-step">
            <div className="learn-step-index"><span>01</span><i /></div>
            <div className="learn-step-copy">
              <span className="learn-step-label">PREPARE</span>
              <h3>准备一个 qubit</h3>
              <p>程序先准备一个 qubit。可以暂时把它理解成量子程序正在操作的数据单位；它一开始处于确定的 <code>|0⟩</code> 状态。</p>
              <code className="learn-qasm-line">qreg q[1];</code>
            </div>
            <div className="learn-state-card" aria-label="初始状态概率">
              <span>当前量子状态</span>
              <div className="learn-probability-row"><code>|0⟩</code><i><b style={{ width: '100%' }} /></i><strong>100%</strong></div>
              <div className="learn-probability-row muted"><code>|1⟩</code><i><b style={{ width: '0%' }} /></i><strong>0%</strong></div>
              <p>此时结果是确定的：只有 <code>|0⟩</code>。</p>
            </div>
          </article>

          <article className="learn-program-step learn-step-featured">
            <div className="learn-step-index"><span>02</span><i /></div>
            <div className="learn-step-copy">
              <span className="learn-step-label">TRANSFORM</span>
              <h3>执行 H，状态发生变化</h3>
              <p><code>H</code> 是一个 quantum gate。gate 像一次状态变换：它把原本确定的 <code>|0⟩</code>，变成同时保留两种可能性的状态。</p>
              <code className="learn-qasm-line">h q[0];</code>
              <aside className="learn-superposition-note">
                <strong>这就叫叠加 · superposition</strong>
                <p>“同时保留多个量子可能性”叫叠加。它不等同于普通程序已经随机选好了一个结果，只是你还不知道。</p>
              </aside>
            </div>
            <div className="learn-state-transition" aria-label="H 执行前后的状态变化">
              <div className="learn-state-card compact">
                <span>执行前</span>
                <div className="learn-probability-row"><code>|0⟩</code><i><b style={{ width: '100%' }} /></i><strong>100%</strong></div>
                <div className="learn-probability-row muted"><code>|1⟩</code><i><b style={{ width: '0%' }} /></i><strong>0%</strong></div>
              </div>
              <div className="learn-transition-arrow">H →</div>
              <div className="learn-state-card compact after">
                <span>执行后</span>
                <div className="learn-probability-row"><code>|0⟩</code><i><b style={{ width: '50%' }} /></i><strong>50%</strong></div>
                <div className="learn-probability-row"><code>|1⟩</code><i><b style={{ width: '50%' }} /></i><strong>50%</strong></div>
              </div>
            </div>
          </article>

          <article className="learn-program-step">
            <div className="learn-step-index"><span>03</span></div>
            <div className="learn-step-copy">
              <span className="learn-step-label">MEASURE</span>
              <h3>测量，把结果交给普通程序</h3>
              <p>measurement 把量子状态读取成经典的 <code>0</code> 或 <code>1</code>。一次运行只得到其中一个结果；重复运行很多次，才会看到接近 50% / 50% 的统计分布。</p>
              <code className="learn-qasm-line">measure q[0] -&gt; c[0];</code>
            </div>
            <div className="learn-measurement-card" aria-label="一次测量与重复运行的区别">
              <div><span>一次运行</span><strong>0 <i>或</i> 1</strong><p>普通程序收到一个确定的 bit</p></div>
              <i className="learn-measurement-divider" />
              <div><span>重复 1,000 shots</span><strong>≈ 50% <i>/</i> 50%</strong><p>多次结果汇总成统计分布</p></div>
            </div>
          </article>
        </div>
      </section>

      <section className="learn-recap" aria-labelledby="recap-heading">
        <div className="learn-recap-intro">
          <span>NOW NAME THE PARTS</span>
          <h2 id="recap-heading">三步连起来，就是一个 quantum circuit</h2>
          <p>准备状态 → 执行 gate → measurement 读取。现在再回头看术语，它们都能在刚才的程序里找到位置。</p>
        </div>
        <dl className="learn-recap-list">
          {RECAP.map(([term, copy]) => (
            <div key={term}><dt>{term}</dt><dd>{copy}</dd></div>
          ))}
        </dl>
      </section>

      <details className="learn-technical">
        <summary>
          <span><i>+</i><strong>想看更技术一点？</strong></span>
          <small>默认收起 · 只讲运行模型</small>
        </summary>
        <div className="learn-technical-grid">
          <p><code>2^n</code><span>n 个 qubit 的纯态，可以用长度 2ⁿ 的复振幅状态向量表示。</span></p>
          <p><code>Gate</code><span>量子门对状态向量做确定性的变换。</span></p>
          <p><code>|a|²</code><span>测量按振幅模平方对应的概率进行采样。</span></p>
          <p><code>shots</code><span>重复运行和测量，会得到 counts 与概率直方图。</span></p>
        </div>
      </details>

      <section className="learn-bottom-cta">
        <span>READY TO EXPLORE</span>
        <h2>你已经能读懂量子程序<br />最基本的执行过程。</h2>
        <p>进入 Explorer 后，可以逐步运行更完整的电路，同时观察每条指令和量子状态变化。</p>
        <button className="learn-primary" onClick={onStart}>进入量子程序 Explorer <span>→</span></button>
      </section>
    </main>
  )
}
