type LearnScreenProps = {
  onStart: () => void
}

const CONCEPTS = [
  {
    index: '01',
    term: 'Qubit',
    name: '量子比特',
    code: 'qreg q[2];',
    copy: '量子程序里的基本信息单位。多个 qubit 一起组成程序当前的量子状态。',
  },
  {
    index: '02',
    term: 'State',
    name: '量子状态',
    code: '|00›  |01›  |10›  |11›',
    copy: '可以先把它理解成程序运行时的数据：它记录当前所有可能结果，以及这些结果之间的信息。',
  },
  {
    index: '03',
    term: 'Gate',
    name: '量子门',
    code: 'state = gate(state)',
    copy: '修改量子状态的一次操作，类似对程序状态执行一个函数。H、CX 都是操作名称。',
  },
  {
    index: '04',
    term: 'Circuit',
    name: '量子电路',
    code: '[ H, CX, measure ]',
    copy: '一组按顺序执行的量子操作。可以先把它看成一段指令列表，程序状态会被逐步更新。',
  },
  {
    index: '05',
    term: 'Measurement',
    name: '测量',
    code: '{ "00": 51%, "11": 49% }',
    copy: '把量子状态读取成普通程序能处理的 0 / 1 结果。同一程序重复运行时，会形成概率分布。',
  },
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
          <span className="learn-eyebrow">QUANTUM PROGRAMMING · DEVELOPER START</span>
          <h1>先用开发者的方式<br />理解量子程序</h1>
          <p>不要求量子物理背景。先把量子程序映射到你熟悉的状态、函数和指令列表——这些概念已经足够开始第一个实验。</p>
          <button className="learn-primary" onClick={onStart}>开始一个量子实验 <span>→</span></button>
        </div>
        <div className="learn-code-window" aria-label="量子程序执行示意">
          <div className="learn-window-bar"><i /><i /><i /><span>mental-model.ts</span></div>
          <div className="learn-code-lines">
            <p><em>01</em><code><b>const</b> qubits = allocate(<span>2</span>)</code></p>
            <p><em>02</em><code><b>let</b> state = <span>|00›</span></code></p>
            <p className="active"><em>03</em><code>state = H(qubits[<span>0</span>])(state)</code></p>
            <p><em>04</em><code>state = CX(qubits)(state)</code></p>
            <p><em>05</em><code><b>const</b> bits = measure(state)</code></p>
          </div>
          <div className="learn-flow">
            <span>QUBITS</span><i>→</i><span>GATES</span><i>→</i><span>STATE</span><i>→</i><span>0 / 1</span>
          </div>
        </div>
      </section>

      <section className="learn-concepts" aria-labelledby="concept-heading">
        <div className="learn-section-heading">
          <div>
            <span>MINIMUM MENTAL MODEL</span>
            <h2 id="concept-heading">读懂量子程序，只需要先认识五件事</h2>
          </div>
          <p>先建立整体地图，具体的门和算法可以在运行电路时再理解。</p>
        </div>
        <div className="learn-concept-grid">
          {CONCEPTS.map((concept) => (
            <article className="learn-concept-card" key={concept.term}>
              <div className="learn-concept-meta"><span>{concept.index}</span><em>{concept.term}</em></div>
              <h3>{concept.name}</h3>
              <p>{concept.copy}</p>
              <code>{concept.code}</code>
            </article>
          ))}
        </div>
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
        <h2>不必先学完量子计算，<br />从读懂第一段电路开始。</h2>
        <p>Explorer 会把电路拆成连续步骤，让你同时看到当前操作、代码语句和量子状态变化。</p>
        <button className="learn-primary" onClick={onStart}>开始一个量子实验 <span>→</span></button>
        <button className="learn-text-link" onClick={onStart}>我已经了解基础概念，直接开始</button>
      </section>
    </main>
  )
}
