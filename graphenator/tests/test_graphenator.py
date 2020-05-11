from graphenator import Graphenator
import graphene
import json


def execute(graphenate, query):
    schema = graphenate.Schema
    response = schema.execute(query)
    assert not response.errors
    return json.loads(json.dumps(response.data))


def test_add():
    graphenate = Graphenator()

    @graphenate.args(
        x=graphene.Int(),
        y=graphene.Int(),
    )
    @graphenate.returns(graphene.Int())
    def add(x=0, y=0):
        '''Add two numbers.'''
        return x + y

    assert execute(graphenate, '{add(x: 5 y: 6)}') == {'add': 11}
    # TODO: assert on description.


def test_argless():
    graphenate = Graphenator()

    @graphenate
    def example():
        return 'testing'

    assert execute(graphenate, '{example}') == \
        {'example': 'testing'}


def test_say_hello():
    graphenate = Graphenator()

    @graphenate
    def say_hello(description='world'):
        return 'Hello, {}'.format(description)

    assert execute(graphenate, '{sayHello}') == \
        {'sayHello': 'Hello, world'}
    assert execute(graphenate, '{sayHello(description: "space")}') == \
        {'sayHello': 'Hello, space'}


def test_get_dict():
    graphenate = Graphenator()

    @graphenate.returns(graphene.JSONString())
    @graphenate.args(x=graphene.Float())
    def get_dict(x):
        return {
            'nested': {
                'example': x * 2,
            },
        }

    assert execute(graphenate, '{getDict(x: 25.3)}') == \
        {'getDict': '{"nested": {"example": 50.6}}'}


def test_get_floats():
    graphenate = Graphenator()

    @graphenate.returns(graphene.List(graphene.Float))
    def get_floats():
        return [1., 3.5, 7.2, 2.8]

    assert execute(graphenate, '{getFloats}') == \
        {'getFloats': [1.0, 3.5, 7.2, 2.8]}


def test_get_obj():
    graphenate = Graphenator()

    class Duh(graphene.ObjectType):
        thing = graphene.String()

    @graphenate.returns(graphene.List(Duh))
    def get_duh():
        return [Duh(thing='asddsa')]

    assert execute(graphenate, '{getDuh}') == \
        {'getDuh': {'thing': 'asddsa'}}


#graphql_view = GraphQLView.as_view(str('graphql'), schema=schema)
#app = flask.Flask(__name__)
#app.add_url_rule('/graphql', view_func=graphql_view)
