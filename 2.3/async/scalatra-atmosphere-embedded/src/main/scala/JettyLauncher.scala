import java.io.File
import org.slf4j.LoggerFactory
import java.net.InetSocketAddress
import org.eclipse.jetty.server.Server
import org.eclipse.jetty.webapp.WebAppContext
import org.eclipse.jetty.util.preventers.AppContextLeakPreventer
import org.eclipse.jetty.util.preventers.GCThreadLeakPreventer
import org.eclipse.jetty.util.preventers.DriverManagerLeakPreventer

object JettyLauncher {

  private val logger = LoggerFactory.getLogger(JettyLauncher.getClass())

  def systemProperty(name: String): Option[String] = {
    if (System.getProperty(name) != null) Some(System.getProperty(name))
    else if (System.getenv(name) != null) Some(System.getenv(name))
    else None
  }

  /**
   * Tries to extract the current PID from the Java environment
   */
  lazy val pid: Int = {
    try {
      val runtime = java.lang.management.ManagementFactory.getRuntimeMXBean()
      val jvm = runtime.getClass().getDeclaredField("jvm")
      jvm.setAccessible(true)
      val mgmt = jvm.get(runtime).asInstanceOf[sun.management.VMManagement]
      val pid_method = mgmt.getClass().getDeclaredMethod("getProcessId")
      pid_method.setAccessible(true)
      pid_method.invoke(mgmt).asInstanceOf[Int]
    }
    catch {
      case e: Throwable =>
        systemProperty("sun.java.launcher.pid").map(_.toInt).getOrElse(throw e)
    }
  }

  def printToFile(f: java.io.File)(op: java.io.PrintWriter => Unit) {
    val p = new java.io.PrintWriter(f)
    try { op(p) } finally { p.close() }
  }

  def main(args: Array[String]) {
    /*
     * Write PID file if required 
     */
    val pidPropname = "pidfile.path"
    val pidfile: Option[File] = systemProperty(pidPropname).map(value => new File(value))
    pidfile match {
      case Some(pidfile) =>
        logger.info(s"Writing current PID to ${pidfile.getCanonicalPath()}: $pid")
        printToFile(pidfile) { writer =>
          writer.print(pid)
        }
      case None =>
        logger.warn(s"No PID file given in environment variable '$pidPropname', will not write current PID to file: $pid")
    }

    /*
     * Start the Web Server.
     */
    val host: String = systemProperty("http.address").getOrElse("0.0.0.0")
    val port: Int = systemProperty("http.port").map(_.toInt).getOrElse(9000)
    logger.info(s"Starting web server on ${host}:${port}")
    val server = new Server(new InetSocketAddress(host, port))
    val context: WebAppContext = new WebAppContext()
    context.setServer(server)
    context.setContextPath("/")
    /*
     * This is the relative path to the web app (web.xml).
     * The base path / document root can be set via the environment variable "user.dir" eg.
     * -Duser.dir=/mnt/rawideas/java/play2/telstra_alex_sweep
     */
    context.setWar("src/main/webapp")
    server.setHandler(context)
    // http://www.eclipse.org/jetty/documentation/current/preventing-memory-leaks.html
    server.addBean(new GCThreadLeakPreventer())
    server.addBean(new AppContextLeakPreventer())
    server.addBean(new DriverManagerLeakPreventer())

    try {
      server.start()
      server.join()
    }
    catch {
      case ex: Exception => {
        logger.error(s"Server with PID $pid crashed", ex)
        System.exit(1)
      }
    }
  }
}