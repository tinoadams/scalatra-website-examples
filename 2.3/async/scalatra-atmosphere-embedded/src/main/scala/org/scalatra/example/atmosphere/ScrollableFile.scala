package org.scalatra.example.atmosphere

import java.io.RandomAccessFile
import java.nio.MappedByteBuffer
import java.nio.channels.AsynchronousFileChannel
import java.nio.file._
import java.nio.charset._
import java.nio.channels.CompletionHandler
import scala.concurrent.Future
import scala.concurrent.Promise
import java.nio.ByteBuffer
import scala.concurrent.ExecutionContext.Implicits.global

class ScrollableFile(val filename: String, val charsetName: String = "UTF-8") {
  val bufferSize: Int = 20;
  val charset = Charset.forName(charsetName)
  //  private val handle = new RandomAccessFile(filename, "r")
  private val channel = AsynchronousFileChannel.open(Paths.get(filename));

  private var start, end: Long = 0

  def up(): String = {
    ""
  }

  implicit def nioHandler: (Future[Integer], CompletionHandler[Integer, java.lang.Object]) = {
    val promise = Promise[Integer]()
    val handler = new CompletionHandler[Integer, java.lang.Object]() {
      override def completed(result: Integer, attachment: java.lang.Object): Unit = promise.success(result)
      override def failed(e: Throwable, attachment: java.lang.Object): Unit = promise.failure(e)
    }

    (promise.future, handler)
  }

  def down(): Future[Option[String]] = {
    start = end
    down(start)
  }

  private def down(start: Long): Future[Option[String]] = {
    read(start).flatMap {
      case None =>
        Future(None)
      case Some(str) =>
        println(str)
        val eol = str.indexOf("""$""")
        if (eol == -1)
          down(end).map { _.map { append => str + append } }
        else {
          println(eol + "...")
          val substr = str.substring(0, eol)
          println(substr + "...")
          end -= (str.getBytes().length - substr.getBytes().length) + 16
          Future(Some(substr))
        }
    }
  }

  private def read(start: Long): Future[Option[String]] = {
    val buffer = ByteBuffer.allocateDirect(bufferSize)
    val (future, handler) = nioHandler
    channel.read(buffer, start, null, handler)
    future.map { read =>
      end += read
      if (read == -1) None
      else {
        buffer.rewind()
        Some(charset.decode(buffer).toString)
      }
    }
  }

  def close = channel.close()
}