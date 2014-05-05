package org.scalatra.example.atmosphere

// Default imports from a stock Scalatra g8 code generator:
import org.scalatra._
import scalate.ScalateSupport
import org.scalatra.atmosphere._
import org.scalatra.servlet.AsyncSupport
import org.scalatra.json.{ JValueResult, JacksonJsonSupport }
import org.json4s._
import JsonDSL._
import java.util.Date
import java.text.SimpleDateFormat
import org.fusesource.scalate.Template
import scala.concurrent._
import ExecutionContext.Implicits.global
import _root_.akka.actor.Props
import _root_.akka.actor.Actor
import _root_.akka.actor.ActorRef
import java.nio.file.Paths
import java.nio.file.StandardWatchEventKinds
import scala.collection.JavaConversions._
import java.io.RandomAccessFile

class ChatController extends ScalatraServlet
  with ScalateSupport with JValueResult
  with JacksonJsonSupport with SessionSupport
  with AtmosphereSupport {

  implicit protected val jsonFormats: Formats = DefaultFormats

  get("/") {
    contentType = "text/html"
    ssp("/index")
  }

  atmosphere("/the-chat") {
    new AtmosphereClient {
      case class OpenFile(handle: RandomAccessFile, start: Long = 0, end: Long = 0)
      var fileHandle: Option[OpenFile] = None

      def closeFile = fileHandle.foreach(_.handle.close)

      def receive: AtmoReceive = {
        case Connected =>
          println("Client %s is connected" format uuid)
          broadcast(("author" -> "Someone") ~ ("message" -> "joined the room") ~ ("time" -> (new Date().getTime.toString)), Everyone)

        case Disconnected(ClientDisconnected, _) =>
          closeFile
          broadcast(("author" -> "Someone") ~ ("message" -> "has left the room") ~ ("time" -> (new Date().getTime.toString)), Everyone)

        case Disconnected(ServerDisconnected, _) =>
          closeFile
          println("Server disconnected the client %s" format uuid)

        case _: TextMessage =>
          send(("author" -> "system") ~ ("message" -> "Only json is allowed") ~ ("time" -> (new Date().getTime.toString)))

        case JsonMessage(json) =>
          println("Got message %s from %s".format((json \ "message").extract[String], (json \ "author").extract[String]))
          json \ "message" match {
            case JString(cmd) if cmd.startsWith("open ") =>
              val Array(_, file) = cmd.split(" ")
              closeFile
              fileHandle = Some(OpenFile(new RandomAccessFile(file, "r")))
              val lines = for (i <- 1 to 3) yield fileHandle.get.handle.readLine
              val msg = json merge (("message" -> lines.mkString("<br/>")): JValue)
              fileHandle = fileHandle.map(_.copy(end = fileHandle.get.handle.getFilePointer()))
              send(msg)
            case JString("d") | JString("D") =>

            case _ =>
          }
          val msg = json merge (("time" -> (new Date().getTime().toString)): JValue)
          broadcast(msg) // by default a broadcast is to everyone but self
        //  send(msg) // also send to the sender
      }
    }
  }

  error {
    case t: Throwable => t.printStackTrace()
  }

  notFound {
    // remove content type in case it was set through an action
    contentType = null
    // Try to render a ScalateTemplate if no route matched
    findTemplate(requestPath) map { path =>
      contentType = "text/html"
      layoutTemplate(path)
    } orElse serveStaticResource() getOrElse resourceNotFound()
  }
}
