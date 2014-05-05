import sbt._
import Keys._
import com.mojolly.scalate.ScalatePlugin._
import ScalateKeys._
import com.typesafe.sbteclipse.plugin.EclipsePlugin._
import EclipseKeys._
import com.typesafe.sbt.SbtStartScript

object build extends Build {
  val Organization = "com.example"
  val Name = "Scalatra Atmosphere Embedded"
  val Version = "0.1.0-SNAPSHOT"
  val ScalaVersion = "2.10.3"
  val ScalatraVersion = "2.3.0.RC1"
  val json4sversion = "3.2.7"
  val jettyVersion = "9.1.3.v20140225"

  lazy val project = Project (
    "atmosphere-example",
    file("."),
    settings = SbtStartScript.startScriptForClassesSettings ++ Defaults.defaultSettings ++  scalateSettings ++ Seq(
      organization := Organization,
      name := Name,
      version := Version,
      scalaVersion := ScalaVersion,
      EclipseKeys.withSource := true,
      EclipseKeys.createSrc := EclipseCreateSrc.Default + EclipseCreateSrc.Resource,
      resolvers += "Sonatype OSS Snapshots" at "http://oss.sonatype.org/content/repositories/snapshots/",
      resolvers += "Akka Repo" at "http://repo.akka.io/repository",
      libraryDependencies ++= Seq(
        "org.json4s"                  %% "json4s-jackson"      % json4sversion,
        "org.scalatra"                %% "scalatra"            % ScalatraVersion,
        "org.scalatra"                %% "scalatra-scalate"    % ScalatraVersion,
        "org.scalatra"                %% "scalatra-atmosphere" % ScalatraVersion,
        "junit"                       %  "junit"    	       % "4.11"            % "test",
        "ch.qos.logback"              %  "logback-classic"     % "1.1.1"           % "runtime",
        "org.eclipse.jetty"           %  "jetty-plus"          % jettyVersion      % "compile;provided",
        "org.eclipse.jetty"           %  "jetty-webapp"        % jettyVersion      % "compile",
        "org.eclipse.jetty.websocket" %  "websocket-server"    % jettyVersion      % "compile;provided",
        "javax.servlet"               %  "javax.servlet-api"   % "3.1.0"           % "compile;provided;test"
      ),
      scalateTemplateConfig in Compile <<= (sourceDirectory in Compile){ base =>
        Seq(
          TemplateConfig(
            base / "webapp" / "WEB-INF" / "templates",
            Seq.empty,  /* default imports should be added here */
            Seq.empty,  /* add extra bindings here */
            Some("templates")
          )
        )
      }
    )
  )
}
