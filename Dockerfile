FROM maven:3.5.2-jdk-8-alpine AS MAVEN_TOOL_CHAIN
# copy in tbx2rdf sources
COPY pom.xml /tmp/
COPY src /tmp/src/
COPY repo /tmp/repo/
COPY doc /tmp/doc/
WORKDIR /tmp/
# compile and package tbx2rdf
RUN mvn package

#FROM tomcat:9.0-jre8-alpine
FROM openjdk:8-jre-stretch
#COPY --from=MAVEN_TOOL_CHAIN /tmp/target/wizard*.war $CATALINA_HOME/webapps/wizard.war

#FROM alpine:latest
#COPY --from=MAVEN_TOOL_CHAIN /tmp/target/* 

# base image enhancements
RUN apt-get update -yq 
RUN apt-get update && apt-get install -y bash git python-setuptools psmisc procps curl vim gnupg raptor2-utils apt-transport-https

# node installation
RUN curl -sL https://deb.nodesource.com/setup_11.x -o node_setup.sh
RUN chmod +x node_setup.sh && ./node_setup.sh

RUN apt-get -y install nodejs
RUN npm cache clean -f

# environment variable for headless php installation
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y php7.0-cli php7.0-mbstring php7.0-mcrypt php7.0-xml

#WORKDIR /tmp/

WORKDIR /tmp/virtinstall/

# mariadb
RUN curl -LsS https://downloads.mariadb.com/MariaDB/mariadb_repo_setup | bash
RUN apt-get -yq update && \
    echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections && \ 
   DEBIAN_FRONTEND=noninteractive apt-get -yq install mariadb-server mariadb-client 
RUN mkdir -p /var/run/mysqld && chown mysql:mysql /var/run/mysqld/


# virtuoso - Copy files
COPY ./container-files/startall.sh /startall.sh

# project and maven setup from previous chain
COPY --from=MAVEN_TOOL_CHAIN /tmp/ /tmp/
COPY samples /tmp/samples/
COPY *.properties /tmp/
COPY *.yaml /tmp/
COPY mappings.default /tmp/
COPY ontology /tmp/ontology/
COPY server /tmp/server/

# switch to API server and install requirements
WORKDIR /tmp/server/
RUN npm install

WORKDIR /tmp/

# configure periodic health check
HEALTHCHECK --interval=1m --timeout=3s CMD wget --quiet --tries=1 --spider http://localhost:8080/health_check || exit 1

EXPOSE 8080

# CMD npm start 
# CMD /virtuoso.sh
WORKDIR /tmp/server/
CMD /startall.sh
