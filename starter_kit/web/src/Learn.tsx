import type { ReactNode } from 'react'
import { GlobalNavigation, type AppScreen } from './Navigation'

type LearnScreenProps = {
  onStart: () => void
  onNavigate: (screen: AppScreen) => void
}

type QuantumTermProps = {
  children: ReactNode
  english: string
}

// 基础术语只做静态视觉提示，中文始终是主要阅读路径。
function QuantumTerm({ children, english }: QuantumTermProps) {
  return <span className="quantum-term">{children}{english && <span className="quantum-term-en">（{english}）</span>}</span>
}

const RECAP = [
  ['量子比特', '程序正在操作的数据单位'],
  ['量子状态', '程序此刻保留的量子可能性'],
  ['量子门', '改变当前量子状态的操作'],
  ['量子电路', '按顺序组织这些操作的一段程序'],
  ['测量', '把量子状态读取为经典结果'],
]

export function LearnScreen({ onStart, onNavigate }: LearnScreenProps) {
  return (
    <main className="learn-shell">
      <GlobalNavigation current="learn" onNavigate={onNavigate} />

      <section className="learn-landing">
        <div className="learn-landing-copy">
          <span className="learn-eyebrow">AI-NATIVE QUANTUM DEVELOPMENT</span>
          <h1>让开发者先跨过<br />量子计算的专业壁垒</h1>
          <p>面向有编程基础、但没有量子专业背景的开发者。LoomQ 借助 AI 帮你生成、理解、验证和修复量子程序，并找到合适的运行平台。</p>
          <small>不用先成为量子专家，也能完成自己的第一次量子实验。</small>
          <div className="learn-landing-actions">
            <a className="learn-primary learn-guide-link" href="#learn-why">30 秒看懂一个量子程序 <span>↓</span></a>
            <button className="learn-landing-secondary" onClick={onStart}>直接选择实验 <span>→</span></button>
          </div>
        </div>
        <div className="learn-product-flow" aria-label="LoomQ 从开发意图到运行平台的能力链路">
          <span>YOUR INTENT</span>
          <div><strong>用自然语言描述目标</strong><code>生成 · 理解</code></div>
          <i>↓ <em>AI</em></i>
          <span>QUANTUM PROGRAM</span>
          <div><strong>获得可读的量子程序</strong><code>验证 · 修复</code></div>
          <i>↓ <em>SELECT</em></i>
          <span>BACKEND</span>
          <div><strong>找到合适的运行平台</strong><code>约束 · 推荐</code></div>
        </div>
      </section>

      {/* 用三个短例子说明量子计算的适用边界，避免扩展成行业科普。 */}
      <section className="learn-why" id="learn-why" aria-labelledby="learn-why-heading">
        <div className="learn-why-heading">
          <div>
            <span>WHY QUANTUM MATTERS</span>
            <h2 id="learn-why-heading">量子计算不是“更快的电脑”</h2>
          </div>
          <div>
            <p>它并不适合大多数普通程序。量子计算真正有价值的地方，是少数具有特殊结构的问题：适用面很窄，但一旦命中，可能带来传统算法难以达到的优势。</p>
            <strong>不是所有问题都更快，而是在少数问题上改变可计算性的边界。</strong>
          </div>
        </div>

        <div className="learn-why-list">
          <article className="learn-why-item learn-why-item-featured">
            <span>01 · 与开发者最直接相关</span>
            <h3>密码学</h3>
            <p>Shor 算法会威胁 RSA、椭圆曲线等公钥密码体系，推动行业迁移到后量子密码。它改变的是软件基础设施的安全假设，不代表今天的量子电脑能破解所有密码。</p>
          </article>
          <article className="learn-why-item">
            <span>02 · SEARCH / COMBINATION</span>
            <h3>搜索 / 组合</h3>
            <p>Grover 不是瞬间找到答案；它利用相位与干涉，让目标更容易被测到。后面的搜索实验会直接展示这个过程。</p>
          </article>
          <article className="learn-why-item">
            <span>03 · QUANTUM SIMULATION</span>
            <h3>模拟量子系统</h3>
            <p>分子、材料等本身就是量子系统，量子计算机有机会更自然地模拟它们。</p>
          </article>
        </div>
      </section>

      <section className="learn-hero" id="learn-quickstart">
        <div className="learn-hero-copy">
          <span className="learn-eyebrow">ONE QUBIT · THREE STEPS</span>
          <h1>跟着一个<QuantumTerm english="">量子比特</QuantumTerm>，<br />看懂量子程序怎么运行</h1>
          <p>不需要量子物理背景。我们只运行一个真实的三步程序：</p>
          <div className="learn-hero-sequence" aria-label="三步程序：准备量子状态，然后用 H 改变状态，最后测量结果">
            <span>准备量子状态</span><i>→</i><span>用 H 改变状态</span><i>→</i><span>测量结果</span>
          </div>
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
            <h2 id="program-heading">一个量子电路，三步看完</h2>
          </div>
          <p>拿到程序执行的整体框架，观察每条指令让状态发生了什么。</p>
        </div>
        <div className="learn-circuit-anchor">
          <p><QuantumTerm english="Quantum Circuit">量子电路</QuantumTerm>可以先理解成一段按顺序执行的程序。</p>
          <div aria-label="量子电路的三步执行框架">
            <span>准备量子状态</span><i>→</i><span>量子门改变状态</span><i>→</i><span>测量读取结果</span>
          </div>
          <small>下面用一个量子比特，真正按这个顺序运行一遍。</small>
        </div>

        <div className="learn-step-list">
          <article className="learn-program-step">
            <div className="learn-step-index"><span>01</span><i /></div>
            <div className="learn-step-copy">
              <span className="learn-step-label">PREPARE</span>
              <h3>准备一个量子比特</h3>
              <p>程序先准备一个<QuantumTerm english="Qubit">量子比特</QuantumTerm>。可以暂时把它理解成量子程序正在操作的数据单位；它一开始处于确定的 <code>|0⟩</code> 量子状态。</p>
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
              <p><code>H</code> 是一个<QuantumTerm english="Quantum Gate">量子门</QuantumTerm>。量子门像一次状态变换：它把原本确定的 <code>|0⟩</code>，变成同时保留两种可能性的状态。</p>
              <code className="learn-qasm-line">h q[0];</code>
              <aside className="learn-superposition-note">
                <span className="learn-concept-label"><i>QUANTUM CONCEPT</i><b>量子概念</b></span>
                <strong>这就叫：<span className="quantum-concept-name">叠加<span>（Superposition）</span></span></strong>
                <p>同时保留多个量子可能性，就叫叠加。它不等同于普通程序“已经随机选好了一个结果，只是你还不知道”。</p>
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
              <p><QuantumTerm english="Measurement">测量</QuantumTerm>把量子状态读取成经典的 <code>0</code> 或 <code>1</code>。一次运行只得到其中一个结果；重复运行很多次，才会看到接近 50% / 50% 的统计分布。</p>
              <code className="learn-qasm-line">measure q[0] -&gt; c[0];</code>
            </div>
            <div className="learn-measurement-card" aria-label="一次测量与重复运行的区别">
              <div><span>一次运行</span><strong>0 <i>或</i> 1</strong><p>普通程序收到一个确定的 bit</p></div>
              <i className="learn-measurement-divider" />
              <div><span><QuantumTerm english="Shots">重复运行 1,000 次</QuantumTerm></span><strong>≈ 50% <i>/</i> 50%</strong><p>多次结果汇总成统计分布</p></div>
            </div>
          </article>
        </div>
      </section>

      <section className="learn-recap" aria-labelledby="recap-heading">
        <div className="learn-recap-intro">
          <span>NOW NAME THE PARTS</span>
          <h2 id="recap-heading">你刚刚已经读完了第一个量子电路</h2>
          <p>现在只是给刚才已经看懂的内容补上名字。每个术语，都能在这段程序的执行过程中找到位置。</p>
        </div>
        <dl className="learn-recap-list">
          {RECAP.map(([name, copy]) => (
            <div key={name}>
              <dt><strong>{name}</strong></dt>
              <dd>{copy}</dd>
            </div>
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
        <button className="learn-primary" onClick={onStart}>选择一个量子实验 <span>→</span></button>
      </section>
    </main>
  )
}
